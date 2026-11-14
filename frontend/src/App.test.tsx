import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { IndexedDbGuestStorage, validateStrategyDocument } from './storage';
import type { GuestStorage, StrategyDocument } from './storage';
import { serializeStrategyDocument } from './strategyDocument';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function strategy(
  overrides: Partial<StrategyDocument> = {},
): StrategyDocument {
  return {
    schemaVersion: '1.0',
    rulesetVersion: 'rules-7',
    strategyId: 'd0c74ff8-1840-4be6-a4ba-8e5c90126898',
    name: 'Quiet configuration',
    description: 'Declarative test document.',
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    rouletteConfiguration: {
      wheel: 'american',
      configurationVersion: 'american-2',
    },
    bettingConfiguration: { mode: 'opaque', limits: [2, 5] },
    rules: [
      {
        ruleId: '4a31186a-cb1b-4c0c-9094-b18ab3725cef',
        typeId: 'uninterpreted.rule',
        ruleVersion: '3',
        parameters: { threshold: 8, note: 'keep this' },
      },
    ],
    recoveryRules: [],
    metadata: { origin: 'workspace', labels: ['one', 'two'] },
    executionStatus: 'non_runnable',
    ...overrides,
  };
}

function makeStorage(initial: StrategyDocument[] = []) {
  let records = initial.map((record) => ({ ...record }));
  const storage: GuestStorage = {
    listStrategies: vi.fn(async () => records.map((record) => ({ ...record }))),
    saveStrategy: vi.fn(async (value: unknown) => {
      const saved = validateStrategyDocument(value);
      records = [
        ...records.filter((record) => record.strategyId !== saved.strategyId),
        saved,
      ].sort((a, b) => a.name.localeCompare(b.name));
      return saved;
    }),
    deleteStrategy: vi.fn(async (id: string) => {
      records = records.filter((record) => record.strategyId !== id);
    }),
    getPreferences: vi.fn(async () => null),
    savePreferences: vi.fn(async (value) => value as never),
    listSequences: vi.fn(async () => []),
    saveSequence: vi.fn(async (value) => value as never),
    deleteSequence: vi.fn(async () => undefined),
    exportBackup: vi.fn(async () => ({}) as never),
    importBackup: vi.fn(async () => undefined),
    close: vi.fn(),
  };
  return storage;
}

function enterRequiredFields() {
  fireEvent.change(screen.getByLabelText(/strategy name/i), {
    target: { value: 'New declarative file' },
  });
  fireEvent.change(screen.getByLabelText(/american configuration version/i), {
    target: { value: 'american-1' },
  });
}

describe('strategy library and shared document editor', () => {
  it('shows an honest empty state and accessible workspace controls', async () => {
    render(<App storage={makeStorage()} />);

    expect(await screen.findByText('No strategies yet')).toBeVisible();
    expect(screen.getByRole('heading', { name: /strategy library/i })).toBeVisible();
    const createButton = screen.getByRole('button', { name: /new strategy/i });
    expect(createButton).toBeEnabled();
    createButton.focus();
    expect(document.activeElement).toBe(createButton);
    expect(screen.getByText(/does not execute rules/i)).toBeVisible();
  });

  it('reports unavailable IndexedDB without crashing the editor', async () => {
    vi.stubGlobal('indexedDB', undefined);
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /indexeddb is unavailable/i,
    );
    expect(screen.getByRole('heading', { name: /strategy library/i })).toBeVisible();
  });

  it('creates and views a new non-runnable strategy through GuestStorage', async () => {
    const storage = makeStorage();
    render(<App storage={storage} />);

    fireEvent.click(await screen.findByRole('button', { name: /new strategy/i }));
    enterRequiredFields();
    fireEvent.click(screen.getAllByRole('button', { name: /save strategy/i })[0]);

    expect(await screen.findByText('Strategy saved to this browser. It remains non-runnable.')).toBeVisible();
    expect(storage.saveStrategy).toHaveBeenCalledOnce();
    const saved = (storage.saveStrategy as ReturnType<typeof vi.fn>).mock.calls[0][0] as StrategyDocument;
    expect(saved.schemaVersion).toBe('1.0');
    expect(saved.executionStatus).toBe('non_runnable');
    expect(screen.getByLabelText(/strategy name/i)).toHaveValue('New declarative file');
    expect(screen.getAllByText('Non-runnable').length).toBeGreaterThan(0);
  });

  it('requires explicit confirmation before replacing an unsaved draft', async () => {
    const storage = makeStorage();
    render(<App storage={storage} />);

    fireEvent.click(await screen.findByRole('button', { name: /new strategy/i }));
    fireEvent.change(screen.getByLabelText(/strategy name/i), {
      target: { value: 'Keep this draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: /new strategy/i }));

    const confirmation = screen.getByRole('group', {
      name: /confirm discarding unsaved changes/i,
    });
    expect(confirmation).toBeVisible();
    fireEvent.click(within(confirmation).getByRole('button', { name: /keep editing/i }));
    expect(screen.getByLabelText(/strategy name/i)).toHaveValue('Keep this draft');

    fireEvent.click(screen.getByRole('button', { name: /new strategy/i }));
    fireEvent.click(
      within(
        screen.getByRole('group', { name: /confirm discarding unsaved changes/i }),
      ).getByRole('button', { name: /discard changes/i }),
    );
    expect(screen.getByLabelText(/strategy name/i)).toHaveValue('');
    expect(storage.saveStrategy).not.toHaveBeenCalled();
  });

  it('views, edits, and preserves every supported document field on serialization', async () => {
    const original = strategy();
    const storage = makeStorage([original]);
    render(<App storage={storage} />);

    fireEvent.click(await screen.findByRole('button', { name: /quiet configuration/i }));
    expect(screen.getByLabelText(/strategy name/i)).toHaveValue(original.name);
    expect(screen.getByRole('button', { name: /export json/i })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText(/strategy name/i), {
      target: { value: 'Revised configuration' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /save strategy/i })[0]);

    await waitFor(() => expect(storage.saveStrategy).toHaveBeenCalledOnce());
    const saved = (storage.saveStrategy as ReturnType<typeof vi.fn>).mock.calls[0][0] as StrategyDocument;
    expect(saved).toMatchObject({
      ...original,
      name: 'Revised configuration',
      modifiedAt: expect.any(String),
    });
    expect(saved.createdAt).toBe(original.createdAt);
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
    expect(saved.rules[0].parameters).toEqual({ threshold: 8, note: 'keep this' });
    expect(JSON.parse(serializeStrategyDocument(saved))).toEqual(saved);
  });

  it('duplicates a complete document with a new identity and timestamps', async () => {
    const original = strategy();
    const storage = makeStorage([original]);
    render(<App storage={storage} />);

    fireEvent.click(await screen.findByRole('button', { name: /quiet configuration/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(screen.getByLabelText(/strategy name/i)).toHaveValue('Copy of Quiet configuration');
    fireEvent.click(screen.getAllByRole('button', { name: /save strategy/i })[0]);

    await waitFor(() => expect(storage.saveStrategy).toHaveBeenCalledOnce());
    const duplicate = (storage.saveStrategy as ReturnType<typeof vi.fn>).mock.calls[0][0] as StrategyDocument;
    expect(duplicate.strategyId).not.toBe(original.strategyId);
    expect(duplicate.createdAt).not.toBe(original.createdAt);
    expect(duplicate.bettingConfiguration).toEqual(original.bettingConfiguration);
    expect(duplicate.rules).toEqual(original.rules);
    expect(duplicate.executionStatus).toBe('non_runnable');
  });

  it('requires explicit confirmation to delete through GuestStorage', async () => {
    const storage = makeStorage([strategy()]);
    render(<App storage={storage} />);

    fireEvent.click(await screen.findByRole('button', { name: /quiet configuration/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirmation = screen.getByRole('group', { name: /confirm strategy deletion/i });
    fireEvent.click(within(confirmation).getByRole('button', { name: /delete permanently/i }));

    await waitFor(() => expect(storage.deleteStrategy).toHaveBeenCalledWith(strategy().strategyId));
    expect(screen.getByText('Strategy deleted from this browser.')).toBeVisible();
  });

  it('announces malformed JSON and does not save invalid data', async () => {
    const storage = makeStorage();
    render(<App storage={storage} />);

    fireEvent.click(await screen.findByRole('button', { name: /new strategy/i }));
    enterRequiredFields();
    fireEvent.change(screen.getByRole('textbox', { name: 'Betting configuration' }), {
      target: { value: '{ broken' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /save strategy/i })[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent(/betting configuration must contain valid json/i);
    expect(screen.getByRole('textbox', { name: 'Betting configuration' })).toHaveAttribute('aria-invalid', 'true');
    expect(storage.saveStrategy).not.toHaveBeenCalled();
  });

  it('rejects invalid rule shape and keeps the editor open for correction', async () => {
    const storage = makeStorage();
    render(<App storage={storage} />);

    fireEvent.click(await screen.findByRole('button', { name: /new strategy/i }));
    enterRequiredFields();
    fireEvent.change(screen.getByRole('textbox', { name: /^rules$/i }), {
      target: { value: '{"unexpected":true}' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /save strategy/i })[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent(/rules and recoveryrules must be arrays/i);
    expect(storage.saveStrategy).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: /^rules$/i })).toBeEnabled();
  });

  it('shows unsupported stored schema errors without attempting to replace data', async () => {
    const storage = makeStorage();
    vi.mocked(storage.listStrategies).mockRejectedValueOnce(
      new Error('Unsupported strategy schemaVersion'),
    );
    render(<App storage={storage} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/unsupported strategy schemaversion/i);
    expect(storage.saveStrategy).not.toHaveBeenCalled();
  });

  it('saves through IndexedDB and reloads the same non-runnable document', async () => {
    const indexedDBFactory = new IDBFactory();
    const databaseName = `strategy-editor-${crypto.randomUUID()}`;
    const storage = new IndexedDbGuestStorage({
      databaseName,
      indexedDBFactory,
    });
    const view = render(<App storage={storage} />);

    fireEvent.click(await screen.findByRole('button', { name: /new strategy/i }));
    enterRequiredFields();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Shared editor document' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Rules' }), {
      target: {
        value: JSON.stringify([
          {
            ruleId: '4a31186a-cb1b-4c0c-9094-b18ab3725cef',
            typeId: 'opaque.rule',
            ruleVersion: '1',
            parameters: { preserve: ['all', 'fields'] },
          },
        ], null, 2),
      },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /save strategy/i })[0]);

    expect(await screen.findByText(/strategy saved to this browser/i)).toBeVisible();
    const saved = await storage.listStrategies();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      name: 'New declarative file',
      description: 'Shared editor document',
      rules: [
        {
          typeId: 'opaque.rule',
          parameters: { preserve: ['all', 'fields'] },
        },
      ],
      executionStatus: 'non_runnable',
    });

    view.unmount();
    storage.close();
    const reloaded = new IndexedDbGuestStorage({ databaseName, indexedDBFactory });
    expect(await reloaded.listStrategies()).toEqual(saved);
    reloaded.close();
  });

  it('does not silently export unsupported strategy fields or schema versions', () => {
    expect(() => serializeStrategyDocument({ ...strategy(), schemaVersion: '99.0' })).toThrow(
      /unsupported strategy schemaversion/i,
    );
    expect(() => serializeStrategyDocument({ ...strategy(), extra: true })).toThrow(
      /unsupported field: extra/i,
    );
  });
});
