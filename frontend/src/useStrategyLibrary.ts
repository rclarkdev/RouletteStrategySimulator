import { useCallback, useEffect, useMemo, useState } from 'react';
import { IndexedDbGuestStorage } from './storage';
import type { GuestStorage, StrategyDocument } from './storage';

export interface StrategyLibraryController {
  strategies: StrategyDocument[];
  loading: boolean;
  error: string | null;
  saveStrategy: (value: unknown) => Promise<StrategyDocument>;
  deleteStrategy: (strategyId: string) => Promise<void>;
  clearError: () => void;
}

/** Application-level boundary between React views and guest persistence. */
export function useStrategyLibrary(
  providedStorage?: GuestStorage,
): StrategyLibraryController {
  const initialization = useMemo(() => {
    try {
      return {
        storage: providedStorage ?? new IndexedDbGuestStorage(),
        error: null,
      };
    } catch (reason) {
      return {
        storage: null,
        error:
          reason instanceof Error
            ? reason.message
            : 'Guest storage is unavailable in this browser.',
      };
    }
  }, [providedStorage]);
  const storage = initialization.storage;
  const [strategies, setStrategies] = useState<StrategyDocument[]>([]);
  const [loading, setLoading] = useState(storage !== null);
  const [error, setError] = useState<string | null>(initialization.error);

  const refresh = useCallback(async () => {
    if (!storage) {
      setLoading(false);
      setError(initialization.error ?? 'Guest storage is unavailable.');
      return;
    }
    setLoading(true);
    try {
      const records = await storage.listStrategies();
      setStrategies(records);
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The strategy library could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [initialization.error, storage]);

  useEffect(() => {
    void refresh();
    return () => {
      if (!providedStorage) storage?.close();
    };
  }, [providedStorage, refresh, storage]);

  const saveStrategy = useCallback(
    async (value: unknown) => {
      if (!storage) {
        throw new Error(
          initialization.error ?? 'Guest storage is unavailable.',
        );
      }
      const saved = await storage.saveStrategy(value);
      setStrategies((current) =>
        [
          ...current.filter(
            (strategy) => strategy.strategyId !== saved.strategyId,
          ),
          saved,
        ].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setError(null);
      return saved;
    },
    [initialization.error, storage],
  );

  const deleteStrategy = useCallback(
    async (strategyId: string) => {
      if (!storage) {
        throw new Error(
          initialization.error ?? 'Guest storage is unavailable.',
        );
      }
      await storage.deleteStrategy(strategyId);
      setStrategies((current) =>
        current.filter((strategy) => strategy.strategyId !== strategyId),
      );
      setError(null);
    },
    [initialization.error, storage],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    strategies,
    loading,
    error,
    saveStrategy,
    deleteStrategy,
    clearError,
  };
}
