// Local persistence of project documents (FR-08 auto-save). IndexedDB via Dexie in the
// browser; an in-memory implementation for tests and as a fallback when IndexedDB is blocked.

import type { ProjectDocument } from '@evm/core';
import Dexie, { type Table } from 'dexie';

export interface ProjectStorage {
  loadAll(): Promise<unknown[]>;
  save(document: ProjectDocument): Promise<void>;
  remove(id: string): Promise<void>;
}

interface StoredDocument {
  id: string;
  updatedAt: string;
  document: ProjectDocument;
}

class EvmDatabase extends Dexie {
  documents!: Table<StoredDocument, string>;

  constructor(name: string, options?: ConstructorParameters<typeof Dexie>[1]) {
    super(name, options);
    this.version(1).stores({ documents: 'id, updatedAt' });
  }
}

export class DexieProjectStorage implements ProjectStorage {
  private readonly db: EvmDatabase;

  constructor(name = 'evm-cost-tracker', options?: ConstructorParameters<typeof Dexie>[1]) {
    this.db = new EvmDatabase(name, options);
  }

  /** Raw stored values — the caller validates each one before use. */
  async loadAll(): Promise<unknown[]> {
    const rows = await this.db.documents.orderBy('updatedAt').reverse().toArray();
    return rows.map((row) => row.document);
  }

  async save(document: ProjectDocument): Promise<void> {
    await this.db.documents.put({
      id: document.project.id,
      updatedAt: document.project.updatedAt,
      document,
    });
  }

  async remove(id: string): Promise<void> {
    await this.db.documents.delete(id);
  }
}

export class MemoryProjectStorage implements ProjectStorage {
  private readonly documents = new Map<string, ProjectDocument>();

  constructor(initial: readonly ProjectDocument[] = []) {
    for (const document of initial)
      this.documents.set(document.project.id, structuredClone(document));
  }

  async loadAll(): Promise<unknown[]> {
    return [...this.documents.values()].map((document) => structuredClone(document));
  }

  async save(document: ProjectDocument): Promise<void> {
    this.documents.set(document.project.id, structuredClone(document));
  }

  async remove(id: string): Promise<void> {
    this.documents.delete(id);
  }
}

/** IndexedDB when available, otherwise memory (e.g. some private-browsing modes). */
export function createDefaultStorage(): ProjectStorage {
  try {
    if (typeof indexedDB !== 'undefined') return new DexieProjectStorage();
  } catch {
    // fall through
  }
  return new MemoryProjectStorage();
}

/** Small per-browser preferences (theme, last project). Never throws. */
export const preferences = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      // storage blocked — the preference just won't be remembered
    }
  },
};
