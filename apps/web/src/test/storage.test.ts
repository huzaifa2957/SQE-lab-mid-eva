import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DexieProjectStorage, preferences } from '../lib/storage';
import { makeDocument } from './render';

describe('local persistence (FR-08)', () => {
  it('UT-ST-01 Dexie storage saves, lists newest first, replaces and removes documents', async () => {
    const storage = new DexieProjectStorage(`test-${Math.random()}`, {
      indexedDB: new IDBFactory(),
      IDBKeyRange,
    });
    const older = makeDocument({}, 'a');
    const newer = makeDocument({}, 'b');
    newer.project.updatedAt = '2026-03-01T00:00:00.000Z';

    await storage.save(older);
    await storage.save(newer);
    expect(((await storage.loadAll()) as (typeof older)[]).map((d) => d.project.id)).toEqual([
      'b',
      'a',
    ]);

    await storage.save({ ...older, tasks: [] });
    const reloaded = (await storage.loadAll()) as (typeof older)[];
    expect(reloaded).toHaveLength(2);
    expect(reloaded.find((d) => d.project.id === 'a')!.tasks).toEqual([]);

    await storage.remove('a');
    expect(await storage.loadAll()).toHaveLength(1);
  });

  it('UT-ST-02 preferences never throw when localStorage is blocked', () => {
    const { getItem, setItem } = Storage.prototype;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(preferences.get('x')).toBeNull();
      expect(() => preferences.set('x', '1')).not.toThrow();
    } finally {
      Storage.prototype.getItem = getItem;
      Storage.prototype.setItem = setItem;
    }
  });
});
