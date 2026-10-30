// Draws the app icon (FR-53) with no image libraries: a forest-green rounded square with a
// lime rising cost curve. Writes build/icon.png (512 px) and build/icon.ico (16–256 px).
//
//   node scripts/make-icon.mjs

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const FOREST = [0x18, 0x3a, 0x2b];
const LIME = [0xd4, 0xf4, 0x68];
const MINT = [0xb7, 0xcd, 0xbe];

/** Signed distance from point p to segment a–b. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Colour at (x, y) in a 0..1 square, or null for transparent. */
function shade(x, y) {
  const r = 0.2; // corner radius
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  if (x < 0.02 || x > 0.98 || y < 0.02 || y > 0.98) return null;
  if (Math.hypot(x - cx, y - cy) > r - 0.02 && (x < r || x > 1 - r) && (y < r || y > 1 - r)) {
    return null;
  }
  // baseline
  if (y > 0.775 && y < 0.8 && x > 0.2 && x < 0.8) return MINT;
  // rising curve through these points
  const points = [
    [0.22, 0.7],
    [0.4, 0.6],
    [0.55, 0.47],
    [0.72, 0.28],
  ];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    if (segmentDistance(x, y, ax, ay, bx, by) < 0.045) return LIME;
  }
  if (Math.hypot(x - 0.72, y - 0.28) < 0.085) return LIME;
  return FOREST;
}

/** RGBA pixels with 4×4 supersampling for smooth edges. */
function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const colour = shade(
            (px + (sx + 0.5) / samples) / size,
            (py + (sy + 0.5) / samples) / size,
          );
          if (!colour) continue;
          r += colour[0];
          g += colour[1];
          b += colour[2];
          a += 1;
        }
      }
      const i = (py * size + px) * 4;
      if (a > 0) {
        pixels[i] = Math.round(r / a);
        pixels[i + 1] = Math.round(g / a);
        pixels[i + 2] = Math.round(b / a);
        pixels[i + 3] = Math.round((a / (samples * samples)) * 255);
      }
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size) {
  const pixels = render(size);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO with PNG-compressed images (supported since Windows Vista). */
function ico(sizes) {
  const images = sizes.map(png);
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const entry = 6 + 16 * i;
    header[entry] = size >= 256 ? 0 : size;
    header[entry + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4); // planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(images[i].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, ...images]);
}

const out = new URL('../build/', import.meta.url);
writeFileSync(new URL('icon.png', out), png(512));
writeFileSync(new URL('icon.ico', out), ico([16, 24, 32, 48, 64, 128, 256]));
console.log('Wrote build/icon.png and build/icon.ico');
