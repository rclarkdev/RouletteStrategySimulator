import type {
  GuestBackupDocument,
  GuestStorage,
  JsonValue,
  PreferencesDocument,
  SavedOutcomeSequence,
  SavedSequenceRecord,
  StrategyDocument,
  StrategyRuleDocument,
} from './types';
import { GuestStorageError } from './types';

export const GUEST_DATABASE_VERSION = 2;
export const DEFAULT_MAX_BACKUP_BYTES = 2 * 1024 * 1024;
const MAX_STRATEGY_BYTES = 256 * 1024;
const MAX_PREFERENCES_BYTES = 64 * 1024;
const MAX_SEQUENCE_RECORD_BYTES = 1024 * 1024;
const MAX_RECORDS_PER_KIND = 1_000;
const MAX_JSON_DEPTH = 32;
const MAX_JSON_NODES = 20_000;
const STRATEGIES_STORE = 'strategies';
const SEQUENCES_STORE = 'sequences';
const PREFERENCES_STORE = 'preferences';
const PREFERENCES_KEY = 'guest-preferences';
const POCKETS = new Set([
  '0',
  '00',
  ...Array.from({ length: 36 }, (_, index) => String(index + 1)),
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const STRATEGY_FIELDS = new Set([
  'schemaVersion',
  'rulesetVersion',
  'strategyId',
  'name',
  'description',
  'createdAt',
  'modifiedAt',
  'rouletteConfiguration',
  'bettingConfiguration',
  'rules',
  'recoveryRules',
  'metadata',
  'executionStatus',
]);
const RULE_FIELDS = new Set(['ruleId', 'typeId', 'ruleVersion', 'parameters']);
const ROULETTE_FIELDS = new Set(['wheel', 'configurationVersion']);
const BACKUP_FIELDS = new Set([
  'format',
  'formatVersion',
  'exportedAt',
  'strategies',
  'sequences',
  'preferences',
]);
const SEQUENCE_FIELDS = new Set([
  'formatVersion',
  'source',
  'generator',
  'outcomes',
  'outcomeSequenceSha256',
  'sourceVerified',
]);

export interface IndexedDbGuestStorageOptions {
  databaseName?: string;
  indexedDBFactory?: IDBFactory;
  maxBackupBytes?: number;
  maxRecordsPerKind?: number;
  createId?: () => string;
  now?: () => Date;
  digest?: (data: Uint8Array) => Promise<string>;
}

function fail(message: string): never {
  throw new GuestStorageError('invalid_data', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactFields(
  value: Record<string, unknown>,
  fields: Set<string>,
  label: string,
) {
  for (const field of Object.keys(value)) {
    if (!fields.has(field))
      fail(`${label} contains an unsupported field: ${field}`);
  }
}

function assertNoDuplicateJsonKeys(serialized: string): void {
  const containers: Array<{ type: 'object' | 'array'; keys: Set<string> }> = [];
  let index = 0;
  while (index < serialized.length) {
    const character = serialized[index];
    if (character === '"') {
      const start = index;
      index += 1;
      while (index < serialized.length) {
        if (serialized[index] === '\\') {
          index += 2;
          continue;
        }
        if (serialized[index] === '"') break;
        index += 1;
      }
      const tokenEnd = index + 1;
      index = tokenEnd;
      while (/\s/.test(serialized[index] ?? '')) index += 1;
      if (serialized[index] === ':' && containers.at(-1)?.type === 'object') {
        const key = JSON.parse(serialized.slice(start, tokenEnd)) as string;
        const current = containers.at(-1)!;
        if (current.keys.has(key))
          fail(`Backup contains a duplicate JSON key: ${key}`);
        current.keys.add(key);
      }
      continue;
    }
    if (character === '{') containers.push({ type: 'object', keys: new Set() });
    else if (character === '[')
      containers.push({ type: 'array', keys: new Set() });
    else if (character === '}' || character === ']') containers.pop();
    index += 1;
  }
}

function requiredString(
  value: unknown,
  label: string,
  maximum = 10_000,
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    value.length > maximum
  ) {
    fail(
      `${label} must be a non-empty string no longer than ${maximum} characters`,
    );
  }
  return value;
}

function utcTimestamp(value: unknown, label: string): string {
  const text = requiredString(value, label, 40);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(text)) {
    fail(`${label} must be a UTC ISO-8601 timestamp ending in Z`);
  }
  if (!Number.isFinite(Date.parse(text)))
    fail(`${label} is not a valid timestamp`);
  return text;
}

function validateJsonValue(value: unknown, label: string): JsonValue {
  let visited = 0;
  const walk = (item: unknown, depth: number): JsonValue => {
    visited += 1;
    if (visited > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
      fail(`${label} exceeds JSON nesting or item limits`);
    }
    if (item === null || typeof item === 'string' || typeof item === 'boolean')
      return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (Array.isArray(item)) return item.map((child) => walk(child, depth + 1));
    if (isRecord(item)) {
      const output: Record<string, JsonValue> = {};
      for (const [key, child] of Object.entries(item)) {
        if (
          key === '__proto__' ||
          key === 'prototype' ||
          key === 'constructor'
        ) {
          fail(`${label} contains a disallowed object key`);
        }
        output[key] = walk(child, depth + 1);
      }
      return output;
    }
    return fail(`${label} must contain JSON-compatible values only`);
  };
  return walk(value, 0);
}

function validateJsonObject(
  value: unknown,
  label: string,
): Record<string, JsonValue> {
  if (!isRecord(value)) fail(`${label} must be a JSON object`);
  return validateJsonValue(value, label) as Record<string, JsonValue>;
}

function enforceJsonByteLimit(
  value: unknown,
  maximum: number,
  label: string,
): void {
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > maximum) {
    throw new GuestStorageError(
      'invalid_data',
      `${label} exceeds the supported size limit`,
    );
  }
}

function validateRule(value: unknown, label: string): StrategyRuleDocument {
  if (!isRecord(value)) fail(`${label} must be an object`);
  assertExactFields(value, RULE_FIELDS, label);
  if (typeof value.ruleId !== 'string' || !UUID_PATTERN.test(value.ruleId)) {
    fail(`${label}.ruleId must be a UUID`);
  }
  const typeId = requiredString(value.typeId, `${label}.typeId`, 200);
  const ruleVersion = requiredString(
    value.ruleVersion,
    `${label}.ruleVersion`,
    50,
  );
  const parameters = validateJsonObject(
    value.parameters,
    `${label}.parameters`,
  );
  return { ruleId: value.ruleId, typeId, ruleVersion, parameters };
}

function descriptionText(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 10_000 ||
    value.trim() !== value
  ) {
    fail(
      'description must be a trimmed string no longer than 10000 characters',
    );
  }
  return value;
}

/** Validate and normalize a declarative strategy. It is always kept non-runnable. */
export function validateStrategyDocument(value: unknown): StrategyDocument {
  if (!isRecord(value)) fail('Strategy must be a JSON object');
  assertExactFields(value, STRATEGY_FIELDS, 'Strategy');
  if (value.schemaVersion !== '1.0') fail('Unsupported strategy schemaVersion');
  if (value.rulesetVersion !== null) {
    requiredString(value.rulesetVersion, 'rulesetVersion', 100);
  }
  if (
    typeof value.strategyId !== 'string' ||
    !UUID_PATTERN.test(value.strategyId)
  ) {
    fail('strategyId must be a UUID');
  }
  if (value.executionStatus !== 'non_runnable') {
    fail('Imported strategies must explicitly remain non_runnable');
  }
  if (!isRecord(value.rouletteConfiguration))
    fail('rouletteConfiguration must be an object');
  assertExactFields(
    value.rouletteConfiguration,
    ROULETTE_FIELDS,
    'rouletteConfiguration',
  );
  if (value.rouletteConfiguration.wheel !== 'american') {
    fail('Only the American wheel is supported by this strategy schema');
  }
  if (!Array.isArray(value.rules) || !Array.isArray(value.recoveryRules)) {
    fail('rules and recoveryRules must be arrays');
  }
  if (
    value.rules.length > MAX_RECORDS_PER_KIND ||
    value.recoveryRules.length > MAX_RECORDS_PER_KIND
  ) {
    fail('Strategy contains too many rule entries');
  }
  const strategy: StrategyDocument = {
    schemaVersion: '1.0',
    rulesetVersion: value.rulesetVersion as string | null,
    strategyId: value.strategyId,
    name: requiredString(value.name, 'name', 200),
    description: descriptionText(value.description),
    createdAt: utcTimestamp(value.createdAt, 'createdAt'),
    modifiedAt: utcTimestamp(value.modifiedAt, 'modifiedAt'),
    rouletteConfiguration: {
      wheel: 'american',
      configurationVersion: requiredString(
        value.rouletteConfiguration.configurationVersion,
        'rouletteConfiguration.configurationVersion',
        100,
      ),
    },
    bettingConfiguration: validateJsonObject(
      value.bettingConfiguration,
      'bettingConfiguration',
    ),
    rules: value.rules.map((rule, index) =>
      validateRule(rule, `rules[${index}]`),
    ),
    recoveryRules: value.recoveryRules.map((rule, index) =>
      validateRule(rule, `recoveryRules[${index}]`),
    ),
    metadata: validateJsonObject(value.metadata, 'metadata'),
    executionStatus: 'non_runnable',
  };
  enforceJsonByteLimit(strategy, MAX_STRATEGY_BYTES, 'Strategy');
  return strategy;
}

async function defaultSha256(data: Uint8Array): Promise<string> {
  const cryptoApi = globalThis.crypto?.subtle;
  if (!cryptoApi) {
    throw new GuestStorageError(
      'unavailable',
      'Web Crypto is unavailable for sequence validation',
    );
  }
  const digest = await cryptoApi.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function validateSavedOutcomeSequence(
  value: unknown,
  digest: (data: Uint8Array) => Promise<string> = defaultSha256,
): Promise<SavedOutcomeSequence> {
  if (!isRecord(value)) fail('Outcome sequence must be a JSON object');
  assertExactFields(value, SEQUENCE_FIELDS, 'Outcome sequence');
  if (value.formatVersion !== '1.0' && value.formatVersion !== '1.1') {
    fail('Unsupported outcome sequence formatVersion');
  }
  if (value.source !== 'supplied' && value.source !== 'server_generated') {
    fail('Outcome sequence source is invalid');
  }
  if (value.generator !== null && typeof value.generator !== 'string') {
    fail('Outcome sequence generator must be a string or null');
  }
  if (value.source === 'supplied' && value.generator !== null) {
    fail('Supplied sequences cannot declare a generator');
  }
  if (value.source === 'server_generated' && !value.generator) {
    fail('Generated sequence records must include their claimed generator');
  }
  if (
    !Array.isArray(value.outcomes) ||
    value.outcomes.length < 1 ||
    value.outcomes.length > MAX_RECORDS_PER_KIND * 100
  ) {
    fail(
      'Outcome sequence length is empty or exceeds the supported import limit',
    );
  }
  const outcomes = value.outcomes.map((pocket) => {
    if (typeof pocket !== 'string' || !POCKETS.has(pocket))
      fail('Sequence contains an invalid pocket token');
    return pocket;
  });
  if (
    typeof value.outcomeSequenceSha256 !== 'string' ||
    !SHA256_PATTERN.test(value.outcomeSequenceSha256)
  ) {
    fail('Outcome sequence digest must be a SHA-256 hex string');
  }
  if (
    value.sourceVerified !== undefined &&
    typeof value.sourceVerified !== 'boolean'
  ) {
    fail('sourceVerified must be a boolean');
  }
  const actualDigest = await digest(
    new TextEncoder().encode(JSON.stringify({ outcomes })),
  );
  if (actualDigest !== value.outcomeSequenceSha256.toLowerCase()) {
    fail('Outcome sequence digest does not match its saved outcomes');
  }
  const sequence: SavedOutcomeSequence = {
    formatVersion: '1.1',
    source: value.source,
    generator: value.generator as string | null,
    outcomes,
    outcomeSequenceSha256: actualDigest,
    // Browser JSON is untrusted and cannot attest to server-side generation.
    sourceVerified: false,
  };
  enforceJsonByteLimit(sequence, MAX_SEQUENCE_RECORD_BYTES, 'Outcome sequence');
  return sequence;
}

function validatePreferences(value: unknown): PreferencesDocument {
  if (!isRecord(value)) fail('Preferences must be an object');
  assertExactFields(value, new Set(['schemaVersion', 'values']), 'Preferences');
  if (value.schemaVersion !== '1.0')
    fail('Unsupported preferences schemaVersion');
  const preferences: PreferencesDocument = {
    schemaVersion: '1.0',
    values: validateJsonObject(value.values, 'preferences.values'),
  };
  enforceJsonByteLimit(preferences, MAX_PREFERENCES_BYTES, 'Preferences');
  return preferences;
}

function validateSequenceRecord(value: unknown): SavedSequenceRecord {
  if (!isRecord(value)) fail('Saved sequence record must be an object');
  assertExactFields(
    value,
    new Set(['sequenceId', 'savedAt', 'sequence']),
    'Saved sequence record',
  );
  if (
    typeof value.sequenceId !== 'string' ||
    !UUID_PATTERN.test(value.sequenceId)
  ) {
    fail('sequenceId must be a UUID');
  }
  return {
    sequenceId: value.sequenceId,
    savedAt: utcTimestamp(value.savedAt, 'savedAt'),
    sequence: value.sequence as SavedOutcomeSequence,
  };
}

function mapStorageError(error: unknown): GuestStorageError {
  if (error instanceof GuestStorageError) return error;
  const name =
    error !== null &&
    typeof error === 'object' &&
    'name' in error &&
    typeof error.name === 'string'
      ? error.name
      : '';
  if (name === 'QuotaExceededError') {
    return new GuestStorageError(
      'quota_exceeded',
      'Browser storage quota was exceeded',
      { cause: error },
    );
  }
  return new GuestStorageError(
    'transaction_failed',
    'Browser storage operation failed',
    { cause: error },
  );
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

export class IndexedDbGuestStorage implements GuestStorage {
  private databasePromise: Promise<IDBDatabase> | null = null;
  private readonly factory: IDBFactory;
  private readonly databaseName: string;
  private readonly maxBackupBytes: number;
  private readonly maxRecords: number;
  private readonly createId: () => string;
  private readonly now: () => Date;
  private readonly digest: (data: Uint8Array) => Promise<string>;

  constructor(options: IndexedDbGuestStorageOptions = {}) {
    const factory = options.indexedDBFactory ?? globalThis.indexedDB;
    if (!factory)
      throw new GuestStorageError(
        'unavailable',
        'IndexedDB is unavailable in this browser',
      );
    this.factory = factory;
    this.databaseName =
      options.databaseName ?? 'roulette-strategy-simulator-guest';
    this.maxBackupBytes = options.maxBackupBytes ?? DEFAULT_MAX_BACKUP_BYTES;
    this.maxRecords = options.maxRecordsPerKind ?? MAX_RECORDS_PER_KIND;
    if (!Number.isSafeInteger(this.maxBackupBytes) || this.maxBackupBytes < 1) {
      throw new GuestStorageError(
        'invalid_data',
        'maxBackupBytes must be a positive safe integer',
      );
    }
    if (!Number.isSafeInteger(this.maxRecords) || this.maxRecords < 1) {
      throw new GuestStorageError(
        'invalid_data',
        'maxRecordsPerKind must be a positive safe integer',
      );
    }
    this.createId = options.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = options.now ?? (() => new Date());
    this.digest = options.digest ?? defaultSha256;
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = this.factory.open(this.databaseName, GUEST_DATABASE_VERSION);
      } catch (error) {
        reject(mapStorageError(error));
        return;
      }
      let blocked = false;
      request.onupgradeneeded = (event) => {
        const database = request.result;
        const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
        if (oldVersion < 1) {
          database.createObjectStore(STRATEGIES_STORE, {
            keyPath: 'strategyId',
          });
          const sequences = database.createObjectStore(SEQUENCES_STORE, {
            keyPath: 'sequenceId',
          });
          sequences.createIndex('savedAt', 'savedAt');
        }
        if (oldVersion < 2) {
          database.createObjectStore(PREFERENCES_STORE, { keyPath: 'key' });
        }
      };
      request.onblocked = () => {
        blocked = true;
        reject(
          new GuestStorageError(
            'unavailable',
            'IndexedDB upgrade is blocked by another tab',
          ),
        );
      };
      request.onerror = () => reject(mapStorageError(request.error));
      request.onsuccess = () => {
        const database = request.result;
        if (blocked) {
          database.close();
          return;
        }
        database.onversionchange = () => {
          database.close();
          this.databasePromise = null;
        };
        resolve(database);
      };
    }).catch((error: unknown) => {
      this.databasePromise = null;
      throw mapStorageError(error);
    });
    return this.databasePromise!;
  }

  private async getAll<T>(storeName: string): Promise<T[]> {
    const database = await this.open();
    try {
      const transaction = database.transaction(storeName, 'readonly');
      const done = transactionResult(transaction);
      const [result] = await Promise.all([
        requestResult(
          transaction.objectStore(storeName).getAll() as IDBRequest<T[]>,
        ),
        done,
      ]);
      return result;
    } catch (error) {
      throw mapStorageError(error);
    }
  }

  private async get<T>(
    storeName: string,
    key: IDBValidKey,
  ): Promise<T | undefined> {
    const database = await this.open();
    try {
      const transaction = database.transaction(storeName, 'readonly');
      const done = transactionResult(transaction);
      const [result] = await Promise.all([
        requestResult(
          transaction.objectStore(storeName).get(key) as IDBRequest<
            T | undefined
          >,
        ),
        done,
      ]);
      return result;
    } catch (error) {
      throw mapStorageError(error);
    }
  }

  private async write(
    storeNames: string | string[],
    queueWrites: (transaction: IDBTransaction) => void,
  ): Promise<void> {
    const database = await this.open();
    try {
      const transaction = database.transaction(storeNames, 'readwrite');
      const done = transactionResult(transaction);
      try {
        queueWrites(transaction);
      } catch (error) {
        transaction.abort();
        await done.catch(() => undefined);
        throw error;
      }
      await done;
    } catch (error) {
      throw mapStorageError(error);
    }
  }

  private async putWithinLimit(
    storeName: string,
    key: IDBValidKey,
    value: unknown,
  ): Promise<void> {
    const database = await this.open();
    let countLimitReached = false;
    let operationError: unknown;
    try {
      const transaction = database.transaction(storeName, 'readwrite');
      const done = transactionResult(transaction);
      const store = transaction.objectStore(storeName);
      const countRequest = store.count();
      const abortWithError = (error: unknown) => {
        operationError = error;
        transaction.abort();
      };
      countRequest.onsuccess = () => {
        if (countRequest.result >= this.maxRecords) {
          const existingRequest = store.getKey(key);
          existingRequest.onsuccess = () => {
            if (existingRequest.result === undefined) {
              countLimitReached = true;
              transaction.abort();
            } else {
              try {
                store.put(value);
              } catch (error) {
                abortWithError(error);
              }
            }
          };
          existingRequest.onerror = () => abortWithError(existingRequest.error);
          return;
        }
        try {
          store.put(value);
        } catch (error) {
          abortWithError(error);
        }
      };
      countRequest.onerror = () => abortWithError(countRequest.error);
      await done;
    } catch (error) {
      if (countLimitReached) {
        throw new GuestStorageError(
          'quota_exceeded',
          'Guest record count limit was reached',
          { cause: error },
        );
      }
      if (operationError !== undefined) throw mapStorageError(operationError);
      const mapped = mapStorageError(error);
      if (mapped.name === 'AbortError') {
        throw new GuestStorageError(
          'quota_exceeded',
          'Guest record count limit was reached',
          { cause: error },
        );
      }
      throw mapped;
    }
  }

  async listStrategies(): Promise<StrategyDocument[]> {
    const values = await this.getAll<unknown>(STRATEGIES_STORE);
    return values
      .map(validateStrategyDocument)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveStrategy(value: unknown): Promise<StrategyDocument> {
    const strategy = validateStrategyDocument(value);
    await this.putWithinLimit(STRATEGIES_STORE, strategy.strategyId, strategy);
    return strategy;
  }

  async deleteStrategy(strategyId: string): Promise<void> {
    if (!UUID_PATTERN.test(strategyId)) fail('strategyId must be a UUID');
    await this.write(STRATEGIES_STORE, (transaction) => {
      transaction.objectStore(STRATEGIES_STORE).delete(strategyId);
    });
  }

  async getPreferences(): Promise<PreferencesDocument | null> {
    const stored = await this.get<{ key: string; value: unknown }>(
      PREFERENCES_STORE,
      PREFERENCES_KEY,
    );
    return stored ? validatePreferences(stored.value) : null;
  }

  async savePreferences(value: unknown): Promise<PreferencesDocument> {
    const preferences = validatePreferences(value);
    await this.write(PREFERENCES_STORE, (transaction) => {
      transaction
        .objectStore(PREFERENCES_STORE)
        .put({ key: PREFERENCES_KEY, value: preferences });
    });
    return preferences;
  }

  async listSequences(): Promise<SavedSequenceRecord[]> {
    const values = await this.getAll<unknown>(SEQUENCES_STORE);
    const records = await Promise.all(
      values.map(async (value) => {
        if (!isRecord(value) || !isRecord(value.sequence))
          fail('Stored sequence record is corrupt');
        return validateSequenceRecord({
          ...value,
          sequence: await validateSavedOutcomeSequence(
            value.sequence,
            this.digest,
          ),
        });
      }),
    );
    return records.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  async saveSequence(value: unknown): Promise<SavedSequenceRecord> {
    if (!isRecord(value)) fail('Sequence input must be an object');
    assertExactFields(
      value,
      new Set(['sequenceId', 'sequence']),
      'Sequence input',
    );
    const sequenceId =
      value.sequenceId === undefined ? this.createId() : value.sequenceId;
    if (typeof sequenceId !== 'string' || !UUID_PATTERN.test(sequenceId))
      fail('sequenceId must be a UUID');
    const sequence = await validateSavedOutcomeSequence(
      value.sequence,
      this.digest,
    );
    const record = { sequenceId, savedAt: this.now().toISOString(), sequence };
    await this.putWithinLimit(SEQUENCES_STORE, record.sequenceId, record);
    return record;
  }

  async deleteSequence(sequenceId: string): Promise<void> {
    if (!UUID_PATTERN.test(sequenceId)) fail('sequenceId must be a UUID');
    await this.write(SEQUENCES_STORE, (transaction) => {
      transaction.objectStore(SEQUENCES_STORE).delete(sequenceId);
    });
  }

  async exportBackup(): Promise<GuestBackupDocument> {
    const [strategies, sequences, preferences] = await Promise.all([
      this.listStrategies(),
      this.listSequences(),
      this.getPreferences(),
    ]);
    const backup: GuestBackupDocument = {
      format: 'roulette-strategy-simulator-guest-backup',
      formatVersion: '1.0',
      exportedAt: this.now().toISOString(),
      strategies,
      sequences,
      preferences,
    };
    const serialized = JSON.stringify(backup);
    if (new TextEncoder().encode(serialized).byteLength > this.maxBackupBytes) {
      throw new GuestStorageError(
        'invalid_data',
        'Guest backup exceeds the configured export byte limit',
      );
    }
    return backup;
  }

  async importBackup(serialized: string): Promise<void> {
    if (typeof serialized !== 'string') fail('Backup must be JSON text');
    if (
      serialized.length > this.maxBackupBytes ||
      new TextEncoder().encode(serialized).byteLength > this.maxBackupBytes
    ) {
      throw new GuestStorageError(
        'invalid_data',
        'Backup exceeds the configured byte limit',
      );
    }
    let payload: unknown;
    try {
      assertNoDuplicateJsonKeys(serialized);
      payload = JSON.parse(serialized) as unknown;
    } catch (error) {
      throw new GuestStorageError('invalid_data', 'Backup is not valid JSON', {
        cause: error,
      });
    }
    if (!isRecord(payload)) fail('Backup must be a JSON object');
    assertExactFields(payload, BACKUP_FIELDS, 'Backup');
    if (
      payload.format !== 'roulette-strategy-simulator-guest-backup' ||
      payload.formatVersion !== '1.0'
    ) {
      fail('Unsupported guest backup format');
    }
    utcTimestamp(payload.exportedAt, 'exportedAt');
    if (
      !Array.isArray(payload.strategies) ||
      !Array.isArray(payload.sequences)
    ) {
      fail('Backup strategies and sequences must be arrays');
    }
    if (
      payload.strategies.length > this.maxRecords ||
      payload.sequences.length > this.maxRecords
    ) {
      fail('Backup contains too many records');
    }
    const strategies = payload.strategies.map(validateStrategyDocument);
    const sequences = await Promise.all(
      payload.sequences.map(async (record) => {
        if (!isRecord(record)) fail('Saved sequence record must be an object');
        const sequence = await validateSavedOutcomeSequence(
          record.sequence,
          this.digest,
        );
        return validateSequenceRecord({ ...record, sequence });
      }),
    );
    const strategyIds = strategies.map((strategy) => strategy.strategyId);
    const sequenceIds = sequences.map((sequence) => sequence.sequenceId);
    if (
      new Set(strategyIds).size !== strategyIds.length ||
      new Set(sequenceIds).size !== sequenceIds.length
    ) {
      fail('Backup contains duplicate record identifiers');
    }
    const preferences =
      payload.preferences === null
        ? null
        : validatePreferences(payload.preferences);

    const database = await this.open();
    let importLimitReached = false;
    try {
      const transaction = database.transaction(
        [STRATEGIES_STORE, SEQUENCES_STORE, PREFERENCES_STORE],
        'readwrite',
      );
      const done = transactionResult(transaction);
      try {
        const strategyStore = transaction.objectStore(STRATEGIES_STORE);
        const sequenceStore = transaction.objectStore(SEQUENCES_STORE);
        const strategyKeysRequest = strategyStore.getAllKeys();
        const sequenceKeysRequest = sequenceStore.getAllKeys();
        let strategyKeys: IDBValidKey[] | undefined;
        let sequenceKeys: IDBValidKey[] | undefined;
        const commitImport = () => {
          if (!strategyKeys || !sequenceKeys) return;
          const resultingStrategyCount = new Set([
            ...strategyKeys.map(String),
            ...strategies.map((strategy) => strategy.strategyId),
          ]).size;
          const resultingSequenceCount = new Set([
            ...sequenceKeys.map(String),
            ...sequences.map((sequence) => sequence.sequenceId),
          ]).size;
          if (
            resultingStrategyCount > this.maxRecords ||
            resultingSequenceCount > this.maxRecords
          ) {
            importLimitReached = true;
            transaction.abort();
            return;
          }
          for (const strategy of strategies) strategyStore.put(strategy);
          for (const sequence of sequences) sequenceStore.put(sequence);
          if (preferences) {
            transaction
              .objectStore(PREFERENCES_STORE)
              .put({ key: PREFERENCES_KEY, value: preferences });
          } else {
            transaction.objectStore(PREFERENCES_STORE).delete(PREFERENCES_KEY);
          }
        };
        strategyKeysRequest.onsuccess = () => {
          strategyKeys = strategyKeysRequest.result;
          commitImport();
        };
        sequenceKeysRequest.onsuccess = () => {
          sequenceKeys = sequenceKeysRequest.result;
          commitImport();
        };
        strategyKeysRequest.onerror = () => transaction.abort();
        sequenceKeysRequest.onerror = () => transaction.abort();
      } catch (error) {
        transaction.abort();
        await done.catch(() => undefined);
        throw error;
      }
      await done;
    } catch (error) {
      if (importLimitReached) {
        throw new GuestStorageError(
          'quota_exceeded',
          'Guest record count limit would be exceeded by this backup',
          { cause: error },
        );
      }
      throw mapStorageError(error);
    }
  }

  close(): void {
    const databasePromise = this.databasePromise;
    this.databasePromise = null;
    void databasePromise?.then((database) => database.close());
  }
}
