export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface StrategyRuleDocument {
  ruleId: string;
  typeId: string;
  ruleVersion: string;
  parameters: Record<string, JsonValue>;
}

/** Portable, declarative strategy configuration. This schema is never runnable in this release. */
export interface StrategyDocument {
  schemaVersion: '1.0';
  rulesetVersion: string | null;
  strategyId: string;
  name: string;
  description: string;
  createdAt: string;
  modifiedAt: string;
  rouletteConfiguration: {
    wheel: 'american';
    configurationVersion: string;
  };
  bettingConfiguration: Record<string, JsonValue>;
  rules: StrategyRuleDocument[];
  recoveryRules: StrategyRuleDocument[];
  metadata: Record<string, JsonValue>;
  executionStatus: 'non_runnable';
}

/** Sequence record only; it is not simulation history or a completed financial simulation. */
export interface SavedOutcomeSequence {
  formatVersion: '1.1';
  source: 'supplied' | 'server_generated';
  generator: string | null;
  outcomes: string[];
  outcomeSequenceSha256: string;
  /** Always false for browser-imported or guest-persisted records. */
  sourceVerified: false;
}

export interface SavedSequenceRecord {
  sequenceId: string;
  savedAt: string;
  sequence: SavedOutcomeSequence;
}

export interface PreferencesDocument {
  schemaVersion: '1.0';
  values: Record<string, JsonValue>;
}

export interface GuestBackupDocument {
  format: 'roulette-strategy-simulator-guest-backup';
  formatVersion: '1.0';
  exportedAt: string;
  strategies: StrategyDocument[];
  sequences: SavedSequenceRecord[];
  preferences: PreferencesDocument | null;
}

export type GuestStorageErrorCode =
  | 'unavailable'
  | 'quota_exceeded'
  | 'invalid_data'
  | 'not_found'
  | 'transaction_failed';

export class GuestStorageError extends Error {
  constructor(
    readonly code: GuestStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GuestStorageError';
  }
}

/** Browser-local storage boundary. It intentionally has no account or simulation-result methods. */
export interface GuestStorage {
  listStrategies(): Promise<StrategyDocument[]>;
  saveStrategy(value: unknown): Promise<StrategyDocument>;
  deleteStrategy(strategyId: string): Promise<void>;
  getPreferences(): Promise<PreferencesDocument | null>;
  savePreferences(value: unknown): Promise<PreferencesDocument>;
  listSequences(): Promise<SavedSequenceRecord[]>;
  saveSequence(value: unknown): Promise<SavedSequenceRecord>;
  deleteSequence(sequenceId: string): Promise<void>;
  exportBackup(): Promise<GuestBackupDocument>;
  importBackup(serialized: string): Promise<void>;
  close(): void;
}
