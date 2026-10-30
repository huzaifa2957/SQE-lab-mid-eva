// FR-52: desktop settings in the user-data folder. The Gemini API key is encrypted with
// Electron safeStorage (DPAPI on Windows) and never stored or returned in plain text; the
// renderer only ever sees whether a key exists and its last four characters.

import fs from 'node:fs';
import path from 'node:path';
import type { DesktopSettings } from '@evm/platform/bridge';
import { z } from 'zod';

/** The parts of Electron's `safeStorage` this module needs (mocked in tests). */
export interface SecretStorage {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export class SettingsError extends Error {
  override name = 'SettingsError';
}

const StoredSchema = z.object({
  model: z.string().max(100).default(''),
  apiKey: z
    .object({
      /** base64 of safeStorage.encryptString(key) */
      encrypted: z.string().min(1),
      hint: z.string().max(4),
    })
    .optional(),
});

type Stored = z.infer<typeof StoredSchema>;

export class SettingsStore {
  constructor(
    private readonly file: string,
    private readonly secrets: SecretStorage,
  ) {}

  /** Reads settings; a missing or damaged file gives the defaults. */
  private read(): Stored {
    try {
      const parsed = StoredSchema.safeParse(JSON.parse(fs.readFileSync(this.file, 'utf8')));
      return parsed.success ? parsed.data : { model: '' };
    } catch {
      return { model: '' };
    }
  }

  /** Writes atomically (temp file + rename), readable by the current user only. */
  private write(settings: Stored): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }

  /** What the renderer may see. */
  get(): DesktopSettings {
    const stored = this.read();
    return {
      model: stored.model,
      hasApiKey: stored.apiKey !== undefined,
      apiKeyHint: stored.apiKey?.hint ?? null,
      encryptionAvailable: this.secrets.isEncryptionAvailable(),
    };
  }

  /**
   * `apiKey`: a string saves (encrypted), null removes, undefined keeps. Input is already
   * validated by the IPC layer (SaveSettingsSchema).
   */
  save(input: { model?: string; apiKey?: string | null }): DesktopSettings {
    const next: Stored = { ...this.read() };
    if (input.model !== undefined) next.model = input.model.trim();
    if (input.apiKey === null) delete next.apiKey;
    else if (input.apiKey !== undefined) {
      if (!this.secrets.isEncryptionAvailable()) {
        throw new SettingsError(
          'This computer cannot encrypt secrets, so the API key was not saved.',
        );
      }
      const key = input.apiKey.trim();
      next.apiKey = {
        encrypted: this.secrets.encryptString(key).toString('base64'),
        hint: key.slice(-4),
      };
    }
    this.write(next);
    return this.get();
  }

  /** The decrypted key, for the main process only; null if none or it can't be decrypted. */
  getApiKey(): string | null {
    const stored = this.read().apiKey;
    if (!stored || !this.secrets.isEncryptionAvailable()) return null;
    try {
      return this.secrets.decryptString(Buffer.from(stored.encrypted, 'base64'));
    } catch {
      return null;
    }
  }

  getModel(): string {
    return this.read().model;
  }
}
