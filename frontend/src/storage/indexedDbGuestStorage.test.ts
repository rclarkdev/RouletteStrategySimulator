import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_BACKUP_BYTES,
  GUEST_DATABASE_VERSION,
  IndexedDbGuestStorage,
  type IndexedDbGuestStorageOptions,
} from './indexedDbGuestStorage';
import type { GuestBackupDocument, StrategyDocument } from './types';

const FIXED_TIME = new Date('2026-01-02T03:04:05.000Z');
const DIGEST = 'a'.repeat(64);
const openAdapters: IndexedDbGuestStorage[] = [];

function strategy(
  id = 'd0c74ff8-1840-4be6-a4ba-8e5c90126898',
): StrategyDocument {
  return {
    schemaVersion: '1.0',
    rulesetVersion: null,
    strategyId: id,
    name: 'Contract-only strategy',
    description: 'No betting semantics are specified.',
    createdAt: '2026-01-01T00:00:00Z',
    modifiedAt: '2026-01-01T00:00:00Z',
    rouletteConfiguration: {
      wheel: 'american',
      configurationVersion: 'american-1',
    },
    bettingConfiguration: {},
    rules: [],
    recoveryRules: [],
    metadata: {},
    executionStatus: 'non_runnable',
  };
}

function sequenceRecord(id = 'b12752bd-21d5-4e8e-94d7-763fecac80c3') {
  return {
    sequenceId: id,
    savedAt: '2026-01-01T00:00:00Z',
    sequence: {
      formatVersion: '1.1' as const,
      source: 'supplied' as const,
      generator: null,
      outcomes: ['0', '00'],
      outcomeSequenceSha256: DIGEST,
      sourceVerified: false as const,
    },
  };
}

function backup(
  overrides: Partial<GuestBackupDocument> = {},
): GuestBackupDocument {
  return {
    format: 'roulette-strategy-simulator-guest-backup',
    formatVersion: '1.0',
    exportedAt: FIXED_TIME.toISOString(),
    strategies: [strategy()],
    sequences: [sequenceRecord()],
    preferences: {
      schemaVersion: '1.0',
      values: { reducedMotion: true },
    },
    ...overrides,
  };
}

function createStorage(options: Partial<IndexedDbGuestStorageOptions> = {}) {
  const storage = new IndexedDbGuestStorage({
    databaseName: `guest-test-${crypto.randomUUID()}`,
    indexedDBFactory: new IDBFactory(),
    digest: async () => DIGEST,
    now: () => FIXED_TIME,
    createId: () => 'b12752bd-21d5-4e8e-94d7-763fecac80c3',
    ...options,
  });
  openAdapters.push(storage);
  return storage;
}

function openAtVersion(
  factory: IDBFactory,
  name: string,
  version: number,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, version);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('strategies')) {
        database.createObjectStore('strategies', { keyPath: 'strategyId' });
      }
      if (!database.objectStoreNames.contains('sequences')) {
        database.createObjectStore('sequences', { keyPath: 'sequenceId' });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

afterEach(() => {
  for (const adapter of openAdapters.splice(0)) adapter.close();
});

describe('IndexedDbGuestStorage', () => {
  it('creates and upgrades the guest database while retaining v1 data', async () => {
    const factory = new IDBFactory();
    const databaseName = 'guest-upgrade-test';
    const v1 = await openAtVersion(factory, databaseName, 1);
    const transaction = v1.transaction('strategies', 'readwrite');
    transaction.objectStore('strategies').put(strategy());
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    v1.close();

    const storage = createStorage({ databaseName, indexedDBFactory: factory });
    expect(
      (await storage.listStrategies()).map((item) => item.strategyId),
    ).toEqual([strategy().strategyId]);
    await storage.savePreferences({
      schemaVersion: '1.0',
      values: { theme: 'dark' },
    });

    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(databaseName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    expect(upgraded.version).toBe(GUEST_DATABASE_VERSION);
    expect(Array.from(upgraded.objectStoreNames)).toEqual([
      'preferences',
      'sequences',
      'strategies',
    ]);
    upgraded.close();
  });

  it('persists strategies, preferences, and sequences across adapter reloads', async () => {
    const factory = new IDBFactory();
    const databaseName = 'guest-reload-test';
    const first = createStorage({ databaseName, indexedDBFactory: factory });
    await first.saveStrategy(strategy());
    await first.savePreferences({
      schemaVersion: '1.0',
      values: { sound: false },
    });
    const savedSequence = await first.saveSequence({
      sequence: sequenceRecord().sequence,
    });
    first.close();

    const second = createStorage({ databaseName, indexedDBFactory: factory });
    expect(await second.listStrategies()).toEqual([strategy()]);
    expect(await second.getPreferences()).toEqual({
      schemaVersion: '1.0',
      values: { sound: false },
    });
    expect(await second.listSequences()).toEqual([savedSequence]);
    expect((await second.listSequences())[0].sequence.sourceVerified).toBe(
      false,
    );
  });

  it('migrates legacy sequence data to the current unverified format', async () => {
    const storage = createStorage();
    const legacy = { ...sequenceRecord().sequence, formatVersion: '1.0' };
    delete (legacy as { sourceVerified?: boolean }).sourceVerified;

    const saved = await storage.saveSequence({ sequence: legacy });

    expect(saved.sequence.formatVersion).toBe('1.1');
    expect(saved.sequence.sourceVerified).toBe(false);
  });

  it('rejects imported sequences when their digest does not match outcomes', async () => {
    const storage = createStorage({ digest: async () => 'b'.repeat(64) });

    await expect(
      storage.saveSequence({ sequence: sequenceRecord().sequence }),
    ).rejects.toMatchObject({ code: 'invalid_data' });
    expect(await storage.listSequences()).toEqual([]);
  });

  it('rejects a sequence with a mismatched outcome digest', async () => {
    const storage = createStorage({ digest: async () => 'b'.repeat(64) });

    await expect(
      storage.saveSequence({ sequence: sequenceRecord().sequence }),
    ).rejects.toMatchObject({ code: 'invalid_data' });
    expect(await storage.listSequences()).toEqual([]);
  });

  it('validates strategies as non-runnable and rejects unknown fields', async () => {
    const storage = createStorage();
    const runnableClaim = {
      ...strategy(),
      executionStatus: 'runnable',
    };
    await expect(storage.saveStrategy(runnableClaim)).rejects.toMatchObject({
      code: 'invalid_data',
    });

    const executableField = {
      ...strategy(),
      script: 'return a wager',
    };
    await expect(storage.saveStrategy(executableField)).rejects.toMatchObject({
      code: 'invalid_data',
    });
    expect(await storage.listStrategies()).toEqual([]);
  });

  it('rejects invalid and over-size backups before writing any records', async () => {
    const storage = createStorage({ maxBackupBytes: 2_000 });
    const invalid = backup({
      sequences: [
        {
          ...sequenceRecord(),
          sequence: {
            ...sequenceRecord().sequence,
            outcomes: ['bad'],
          },
        },
      ],
    });
    await expect(
      storage.importBackup(JSON.stringify(invalid)),
    ).rejects.toMatchObject({ code: 'invalid_data' });
    await expect(storage.importBackup('x'.repeat(2_001))).rejects.toMatchObject(
      { code: 'invalid_data' },
    );
    expect(await storage.listStrategies()).toEqual([]);
    expect(await storage.listSequences()).toEqual([]);
    expect(await storage.getPreferences()).toBeNull();
  });

  it('rejects backups with duplicate JSON keys before writing records', async () => {
    const storage = createStorage();
    const serialized = JSON.stringify(backup()).replace(
      '"formatVersion":"1.0"',
      '"formatVersion":"1.0","formatVersion":"1.0"',
    );

    await expect(storage.importBackup(serialized)).rejects.toMatchObject({
      code: 'invalid_data',
    });
    expect(await storage.listStrategies()).toEqual([]);
  });

  it('imports all supported record types atomically and round-trips an export', async () => {
    const storage = createStorage();
    await storage.importBackup(JSON.stringify(backup()));

    expect(await storage.listStrategies()).toEqual([strategy()]);
    expect(await storage.listSequences()).toHaveLength(1);
    expect(await storage.getPreferences()).toEqual({
      schemaVersion: '1.0',
      values: { reducedMotion: true },
    });

    const exported = await storage.exportBackup();
    expect(exported.formatVersion).toBe('1.0');
    expect(exported.strategies).toEqual([strategy()]);
    expect(exported.sequences[0].sequence.sourceVerified).toBe(false);

    const restored = createStorage();
    await restored.importBackup(JSON.stringify(exported));
    expect(await restored.listStrategies()).toEqual([strategy()]);
    expect(await restored.listSequences()).toEqual(exported.sequences);
  });

  it('aborts all imported records if an IndexedDB write fails mid-transaction', async () => {
    const storage = createStorage();
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      if (this.name === 'sequences')
        throw new DOMException('simulated write failure', 'DataCloneError');
      return originalPut.apply(this, args);
    };

    try {
      await expect(
        storage.importBackup(JSON.stringify(backup())),
      ).rejects.toMatchObject({
        code: 'transaction_failed',
      });
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }

    expect(await storage.listStrategies()).toEqual([]);
    expect(await storage.listSequences()).toEqual([]);
    expect(await storage.getPreferences()).toBeNull();
  });

  it('surfaces browser quota errors with a stable error code', async () => {
    const storage = createStorage();
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      if (this.name === 'strategies')
        throw new DOMException('quota', 'QuotaExceededError');
      return originalPut.apply(this, args);
    };

    try {
      await expect(storage.saveStrategy(strategy())).rejects.toMatchObject({
        code: 'quota_exceeded',
      });
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }
  });

  it('enforces the configured record count while allowing updates at capacity', async () => {
    const storage = createStorage({ maxRecordsPerKind: 1 });
    await storage.saveStrategy(strategy());
    await storage.saveStrategy({ ...strategy(), name: 'Updated name' });

    await expect(
      storage.saveStrategy(strategy('62bc5e80-6a5a-45ba-a3ac-1bb960ee40cc')),
    ).rejects.toMatchObject({ code: 'quota_exceeded' });
    expect(await storage.listStrategies()).toHaveLength(1);
    expect((await storage.listStrategies())[0].name).toBe('Updated name');
  });

  it('rejects an atomic backup merge that would exceed the local record quota', async () => {
    const storage = createStorage({ maxRecordsPerKind: 1 });
    await storage.saveStrategy(strategy());
    const incoming = backup({
      strategies: [strategy('62bc5e80-6a5a-45ba-a3ac-1bb960ee40cc')],
      sequences: [],
      preferences: null,
    });

    await expect(
      storage.importBackup(JSON.stringify(incoming)),
    ).rejects.toMatchObject({
      code: 'quota_exceeded',
    });
    expect(await storage.listStrategies()).toEqual([strategy()]);
  });

  it('rejects a strategy larger than the per-record byte ceiling', async () => {
    const oversized = { ...strategy(), description: 'x'.repeat(300_000) };
    const storage = createStorage();

    await expect(storage.saveStrategy(oversized)).rejects.toMatchObject({
      code: 'invalid_data',
    });
    expect(await storage.listStrategies()).toEqual([]);
  });

  it('uses the documented default import-size ceiling', () => {
    expect(DEFAULT_MAX_BACKUP_BYTES).toBe(2 * 1024 * 1024);
  });

  it('refuses to export a backup that exceeds the configured byte ceiling', async () => {
    const storage = createStorage({ maxBackupBytes: 100 });
    await storage.saveStrategy(strategy());

    await expect(storage.exportBackup()).rejects.toMatchObject({
      code: 'invalid_data',
    });
  });
});
