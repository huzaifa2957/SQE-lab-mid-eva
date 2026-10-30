// FR-52 / SR-01: the API key is stored encrypted (safeStorage mocked) and never returned.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type SecretStorage, SettingsError, SettingsStore } from '../src/main/settings';

const KEY = 'AIzaSyTEST-secret-key-9876';

/** Reversible stand-in for OS encryption: XOR + marker, so plain text never appears. */
function fakeSafeStorage(available = true): SecretStorage & { available: boolean } {
  return {
    available,
    isEncryptionAvailable() {
      return this.available;
    },
    encryptString: (text) =>
      Buffer.from(`ENC:${[...text].map((c) => String.fromCharCode(c.charCodeAt(0) ^ 7)).join('')}`),
    decryptString: (buffer) => {
      const text = buffer.toString();
      if (!text.startsWith('ENC:')) throw new Error('cannot decrypt');
      return [...text.slice(4)].map((c) => String.fromCharCode(c.charCodeAt(0) ^ 7)).join('');
    },
  };
}

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'evm-settings-'));
  file = path.join(dir, 'settings.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('SettingsStore (FR-52)', () => {
  it('UT-SET-01 defaults when there is no file', () => {
    const store = new SettingsStore(file, fakeSafeStorage());
    expect(store.get()).toEqual({
      model: '',
      hasApiKey: false,
      apiKeyHint: null,
      encryptionAvailable: true,
    });
    expect(store.getApiKey()).toBeNull();
  });

  it('UT-SET-02-P saves the key encrypted; the file and get() never contain it', () => {
    const store = new SettingsStore(file, fakeSafeStorage());
    const shown = store.save({ model: 'gemini-flash-x', apiKey: KEY });
    expect(shown).toEqual({
      model: 'gemini-flash-x',
      hasApiKey: true,
      apiKeyHint: '9876',
      encryptionAvailable: true,
    });
    expect(JSON.stringify(shown)).not.toContain(KEY);
    const raw = readFileSync(file, 'utf8');
    expect(raw).not.toContain(KEY);
    expect(raw).not.toContain('secret-key');
    expect(store.getApiKey()).toBe(KEY); // main process only
    expect(new SettingsStore(file, fakeSafeStorage()).getModel()).toBe('gemini-flash-x');
  });

  it('UT-SET-02-F refuses to save a key when the OS cannot encrypt (no plain-text fallback)', () => {
    const store = new SettingsStore(file, fakeSafeStorage(false));
    expect(() => store.save({ apiKey: KEY })).toThrow(SettingsError);
    expect(() => readFileSync(file, 'utf8')).toThrow();
    expect(store.get().encryptionAvailable).toBe(false);
    expect(store.save({ model: 'only-model' }).model).toBe('only-model');
  });

  it('UT-SET-03 undefined keeps the key, null removes it', () => {
    const store = new SettingsStore(file, fakeSafeStorage());
    store.save({ apiKey: KEY });
    expect(store.save({ model: 'other' }).hasApiKey).toBe(true);
    expect(store.save({ apiKey: null })).toMatchObject({
      hasApiKey: false,
      apiKeyHint: null,
      model: 'other',
    });
    expect(store.getApiKey()).toBeNull();
  });

  it('UT-SET-04 damaged files and undecryptable keys are handled safely', () => {
    writeFileSync(file, '{ not json');
    expect(new SettingsStore(file, fakeSafeStorage()).get().model).toBe('');
    writeFileSync(
      file,
      JSON.stringify({ model: 'm', apiKey: { encrypted: 'bm9wZQ==', hint: '1234' } }),
    );
    const store = new SettingsStore(file, fakeSafeStorage());
    expect(store.get().hasApiKey).toBe(true);
    expect(store.getApiKey()).toBeNull();
  });
});
