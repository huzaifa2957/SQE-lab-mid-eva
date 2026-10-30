// RL-06: file log in the user-data folder — errors and key actions only, never API keys or
// project data. Rotated at 1 MB (main.log → main.log.1). Logging never throws.

import fs from 'node:fs';
import path from 'node:path';

export const LOG_FILE = 'main.log';
export const MAX_LOG_BYTES = 1024 * 1024;

export interface FileLogger {
  /** Folder that holds the log files (Help → Open log folder). */
  readonly dir: string;
  info(message: string): void;
  error(message: string, error?: unknown): void;
}

/** Google API keys look like "AIza…"; also redacted if one ever reaches a message. */
const API_KEY_PATTERN = /AIza[0-9A-Za-z_-]{20,}/g;

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return typeof error === 'string' ? error : 'Unknown error';
}

export function createFileLogger(
  dir: string,
  options: {
    /** Current secrets (e.g. the saved API key) to redact. */
    secrets?: () => readonly string[];
    maxBytes?: number;
    now?: () => Date;
    echo?: boolean;
  } = {},
): FileLogger {
  const file = path.join(dir, LOG_FILE);
  const maxBytes = options.maxBytes ?? MAX_LOG_BYTES;

  const redact = (text: string) => {
    let out = text.replace(API_KEY_PATTERN, '[redacted]');
    for (const secret of options.secrets?.() ?? []) {
      if (secret.length >= 4) out = out.split(secret).join('[redacted]');
    }
    return out.replace(/[\r\n]+/g, ' ');
  };

  const write = (level: 'INFO' | 'ERROR', message: string) => {
    try {
      const line = `${(options.now?.() ?? new Date()).toISOString()} ${level} ${redact(message)}\n`;
      fs.mkdirSync(dir, { recursive: true });
      const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      if (size > 0 && size + Buffer.byteLength(line) > maxBytes) {
        fs.renameSync(file, `${file}.1`); // keeps one previous file
      }
      fs.appendFileSync(file, line, { encoding: 'utf8', mode: 0o600 });
      if (options.echo) (level === 'ERROR' ? console.error : console.info)(line.trimEnd());
    } catch {
      // A full disk or locked file must never crash the app.
    }
  };

  return {
    dir,
    info: (message) => write('INFO', message),
    error: (message, error) =>
      write('ERROR', error === undefined ? message : `${message} — ${describe(error)}`),
  };
}
