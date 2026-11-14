import { useState } from 'react';
import { validateStrategyDocument } from './storage';
import type { GuestStorage, JsonValue, StrategyDocument } from './storage';
import { downloadStrategyDocument } from './strategyDocument';
import { useStrategyLibrary } from './useStrategyLibrary';

type EditorMode = 'view' | 'edit';
type JsonField = 'bettingConfiguration' | 'rules' | 'recoveryRules' | 'metadata';
type JsonTexts = Record<JsonField, string>;
type PendingNavigation =
  | { kind: 'create' }
  | { kind: 'select'; strategy: StrategyDocument }
  | { kind: 'cancel' };

const JSON_FIELDS: Array<{ key: JsonField; label: string; hint: string }> = [
  {
    key: 'bettingConfiguration',
    label: 'Betting configuration',
    hint: 'Opaque JSON object. No rule meanings or betting controls are defined.',
  },
  {
    key: 'rules',
    label: 'Rules',
    hint: 'Opaque JSON array. Rule entries are declarative and non-runnable.',
  },
  {
    key: 'recoveryRules',
    label: 'Recovery rules',
    hint: 'Opaque JSON array. Rule entries are declarative and non-runnable.',
  },
  {
    key: 'metadata',
    label: 'Metadata',
    hint: 'Optional descriptive JSON object.',
  },
];

function currentTimestamp() {
  return new Date().toISOString();
}

function createStrategy(): StrategyDocument {
  const timestamp = currentTimestamp();
  return {
    schemaVersion: '1.0',
    rulesetVersion: null,
    strategyId: crypto.randomUUID(),
    name: '',
    description: '',
    createdAt: timestamp,
    modifiedAt: timestamp,
    rouletteConfiguration: {
      wheel: 'american',
      configurationVersion: '',
    },
    bettingConfiguration: {},
    rules: [],
    recoveryRules: [],
    metadata: {},
    executionStatus: 'non_runnable',
  };
}

function jsonTexts(strategy: StrategyDocument): JsonTexts {
  return {
    bettingConfiguration: JSON.stringify(strategy.bettingConfiguration, null, 2),
    rules: JSON.stringify(strategy.rules, null, 2),
    recoveryRules: JSON.stringify(strategy.recoveryRules, null, 2),
    metadata: JSON.stringify(strategy.metadata, null, 2),
  };
}

function cloneStrategy(strategy: StrategyDocument): StrategyDocument {
  return JSON.parse(JSON.stringify(strategy)) as StrategyDocument;
}

function parseJsonField(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }
}

interface AppProps {
  storage?: GuestStorage;
}

export default function App({ storage }: AppProps) {
  const library = useStrategyLibrary(storage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StrategyDocument | null>(null);
  const [baseline, setBaseline] = useState<StrategyDocument | null>(null);
  const [jsonDraft, setJsonDraft] = useState<JsonTexts | null>(null);
  const [mode, setMode] = useState<EditorMode>('view');
  const [formError, setFormError] = useState<string | null>(null);
  const [deletePromptId, setDeletePromptId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);

  const selected = library.strategies.find(
    (strategy) => strategy.strategyId === selectedId,
  );
  const loweredError = formError?.toLowerCase() ?? '';
  const nameError = loweredError.startsWith('name ');
  const descriptionError = loweredError.startsWith('description ');
  const configurationVersionError = loweredError.includes('configurationversion');
  const rulesetVersionError = loweredError.startsWith('rulesetversion ');

  function jsonErrorFor(key: JsonField) {
    if (!loweredError) return false;
    if (key === 'bettingConfiguration')
      return loweredError.startsWith('betting configuration') || loweredError.startsWith('bettingconfiguration');
    if (key === 'rules') return loweredError.startsWith('rules');
    if (key === 'recoveryRules')
      return loweredError.startsWith('recovery rules') || loweredError.startsWith('recoveryrules');
    return loweredError.startsWith('metadata');
  }

  function showStrategy(strategy: StrategyDocument) {
    const copy = cloneStrategy(strategy);
    setSelectedId(copy.strategyId);
    setDraft(copy);
    setBaseline(cloneStrategy(copy));
    setJsonDraft(jsonTexts(copy));
    setMode('view');
    setFormError(null);
    setNotice(null);
    setDeletePromptId(null);
    setPendingNavigation(null);
  }

  function startCreate() {
    const empty = createStrategy();
    setSelectedId(null);
    setDraft(empty);
    setBaseline(cloneStrategy(empty));
    setJsonDraft(jsonTexts(empty));
    setMode('edit');
    setFormError(null);
    setNotice(null);
    setDeletePromptId(null);
    setPendingNavigation(null);
  }

  function startEdit() {
    if (!selected) return;
    const copy = cloneStrategy(selected);
    setDraft(copy);
    setBaseline(cloneStrategy(copy));
    setJsonDraft(jsonTexts(copy));
    setMode('edit');
    setFormError(null);
    setNotice(null);
  }

  function duplicateSelected() {
    if (!selected) return;
    const timestamp = currentTimestamp();
    const copy = cloneStrategy(selected);
    copy.strategyId = crypto.randomUUID();
    copy.name = `Copy of ${copy.name}`;
    copy.createdAt = timestamp;
    copy.modifiedAt = timestamp;
    setSelectedId(null);
    setDraft(copy);
    setBaseline(cloneStrategy(copy));
    setJsonDraft(jsonTexts(copy));
    setMode('edit');
    setFormError(null);
    setNotice(null);
  }

  function finishCancelEdit() {
    setFormError(null);
    if (selected) {
      showStrategy(selected);
    } else {
      setDraft(null);
      setBaseline(null);
      setJsonDraft(null);
      setMode('view');
    }
  }

  function hasUnsavedChanges(): boolean {
    if (!editable || !draft || !baseline || !jsonDraft) return false;
    return (
      draft.name !== baseline.name ||
      draft.description !== baseline.description ||
      draft.rulesetVersion !== baseline.rulesetVersion ||
      draft.rouletteConfiguration.configurationVersion !==
        baseline.rouletteConfiguration.configurationVersion ||
      JSON.stringify(jsonDraft) !== JSON.stringify(jsonTexts(baseline))
    );
  }

  function requestNavigation(action: PendingNavigation) {
    if (hasUnsavedChanges()) setPendingNavigation(action);
    else performNavigation(action);
  }

  function performNavigation(action: PendingNavigation) {
    setPendingNavigation(null);
    if (action.kind === 'create') startCreate();
    else if (action.kind === 'select') showStrategy(action.strategy);
    else finishCancelEdit();
  }

  async function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !jsonDraft) return;
    setFormError(null);
    library.clearError();
    try {
      const document = {
        ...draft,
        modifiedAt: currentTimestamp(),
        bettingConfiguration: parseJsonField(
          jsonDraft.bettingConfiguration,
          'Betting configuration',
        ) as Record<string, JsonValue>,
        rules: parseJsonField(jsonDraft.rules, 'Rules') as StrategyDocument['rules'],
        recoveryRules: parseJsonField(
          jsonDraft.recoveryRules,
          'Recovery rules',
        ) as StrategyDocument['recoveryRules'],
        metadata: parseJsonField(jsonDraft.metadata, 'Metadata') as Record<
          string,
          JsonValue
        >,
      };
      const validated = validateStrategyDocument(document);
      const saved = await library.saveStrategy(validated);
      showStrategy(saved);
      setNotice('Strategy saved to this browser. It remains non-runnable.');
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : 'The strategy could not be saved.',
      );
    }
  }

  async function confirmDelete() {
    if (!deletePromptId) return;
    const id = deletePromptId;
    try {
      await library.deleteStrategy(id);
      setSelectedId(null);
      setDraft(null);
      setBaseline(null);
      setJsonDraft(null);
      setDeletePromptId(null);
      setNotice('Strategy deleted from this browser.');
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : 'The strategy could not be deleted.',
      );
      setDeletePromptId(null);
    }
  }

  function updateDraft<K extends keyof StrategyDocument>(
    key: K,
    value: StrategyDocument[K],
  ) {
    setFormError(null);
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  const editable = mode === 'edit' && draft !== null && jsonDraft !== null;

  return (
    <main className="workspace-shell">
      <header className="topbar">
        <a className="brand" href="#library" aria-label="Aurelia strategy library home">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>Aurelia <span className="brand-divider">/</span> Strategy desk</span>
        </a>
        <div className="topbar-meta">
          <span className="local-indicator" aria-hidden="true" />
          <span>Stored on this device</span>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="library-pane" id="library" aria-label="Strategy library">
          <div className="library-heading">
            <div>
              <p className="eyebrow">Workspace</p>
              <h2>Library</h2>
            </div>
            <span className="record-count" aria-label={`${library.strategies.length} strategies`}>
              {String(library.strategies.length).padStart(2, '0')}
            </span>
          </div>
          <button
            className="button button-primary new-strategy"
            onClick={() => requestNavigation({ kind: 'create' })}
          >
            <span aria-hidden="true">＋</span> New strategy
          </button>
          <div className="library-list" aria-label="Saved strategies">
            {library.loading ? (
              <p className="library-message" role="status">Opening local library…</p>
            ) : library.strategies.length === 0 ? (
              <div className="library-empty">
                <span className="empty-glyph" aria-hidden="true">—</span>
                <p>No strategies yet</p>
                <span>Your configurations will appear here.</span>
              </div>
            ) : (
              library.strategies.map((strategy) => (
                <button
                  className={`strategy-item${selectedId === strategy.strategyId ? ' is-selected' : ''}`}
                  key={strategy.strategyId}
                  onClick={() => requestNavigation({ kind: 'select', strategy })}
                  aria-current={selectedId === strategy.strategyId ? 'page' : undefined}
                >
                  <span className="strategy-item-topline">
                    <span className="strategy-item-name">{strategy.name}</span>
                    <span className="mini-status">Non-runnable</span>
                  </span>
                  <span className="strategy-item-description">
                    {strategy.description || 'No description'}
                  </span>
                  <span className="strategy-item-version">
                    American · {strategy.rouletteConfiguration.configurationVersion}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="library-footnote">
            <span className="footnote-rule" />
            <p>Configuration only. Execution is not available.</p>
          </div>
        </aside>

        <section className="editor-pane" aria-labelledby="page-title">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Strategy workspace <span className="eyebrow-slash">/</span> American wheel</p>
              <h1 id="page-title">Strategy <em>library</em></h1>
            </div>
            <span className="schema-stamp">DOCUMENT SCHEMA <b>1.0</b></span>
          </div>

          {library.error && (
            <div className="message message-error" role="alert">
              <strong>Library unavailable</strong>
              <span>{library.error} Existing data was not changed.</span>
            </div>
          )}
          {notice && <div className="message message-success" role="status">{notice}</div>}
          {formError && <div className="message message-error" role="alert">{formError}</div>}

          {!draft && !library.loading && (
            <div className="welcome-panel" aria-live="polite">
              <div className="welcome-mark" aria-hidden="true"><span>01</span></div>
              <div className="welcome-copy">
                <p className="eyebrow">A considered place for configuration</p>
                <h2>Keep your strategy<br />documents in order.</h2>
                <p>Save and review declarative strategy files locally. This workspace does not execute rules or produce outcomes.</p>
                <button
                  className="button button-outline"
                  onClick={() => requestNavigation({ kind: 'create' })}
                >
                  Create your first strategy <span aria-hidden="true">↗</span>
                </button>
              </div>
              <div className="welcome-index" aria-hidden="true">A / 01</div>
            </div>
          )}

          {draft && (
            <form className="strategy-form" onSubmit={saveDraft} noValidate>
              <div className="document-toolbar">
                <div className="document-state">
                  <span className="state-dot" aria-hidden="true" />
                  <span>{editable ? (selected ? 'Editing document' : 'New document') : 'Saved document'}</span>
                  <span className="toolbar-separator">/</span>
                  <span className="non-runnable-label">Non-runnable</span>
                </div>
                <div className="toolbar-actions">
                  {!editable && selected && (
                    <>
                      <button type="button" className="button button-quiet" onClick={duplicateSelected}>Duplicate</button>
                      <button type="button" className="button button-quiet" onClick={() => downloadStrategyDocument(selected)}>Export JSON</button>
                      <button type="button" className="button button-quiet" onClick={startEdit}>Edit</button>
                      <button type="button" className="button button-danger-quiet" onClick={() => setDeletePromptId(selected.strategyId)}>Delete</button>
                    </>
                  )}
                  {editable && (
                    <>
                      <button
                        type="button"
                        className="button button-quiet"
                        onClick={() => requestNavigation({ kind: 'cancel' })}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="button button-primary">Save strategy <span aria-hidden="true">↗</span></button>
                    </>
                  )}
                </div>
              </div>

              {pendingNavigation && (
                <div
                  className="discard-confirm"
                  role="group"
                  aria-label="Confirm discarding unsaved changes"
                >
                  <span>This document has unsaved changes.</span>
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() => performNavigation(pendingNavigation)}
                  >
                    Discard changes
                  </button>
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => setPendingNavigation(null)}
                  >
                    Keep editing
                  </button>
                </div>
              )}

              {deletePromptId && selected && (
                <div className="delete-confirm" role="group" aria-label="Confirm strategy deletion">
                  <span>Delete “{selected.name}” from this device?</span>
                  <button type="button" className="button button-danger" onClick={() => void confirmDelete()}>Delete permanently</button>
                  <button type="button" className="button button-quiet" onClick={() => setDeletePromptId(null)}>Keep strategy</button>
                </div>
              )}

              <fieldset disabled={!editable} className="document-fields">
                <section className="form-section identity-section" aria-labelledby="identity-title">
                  <div className="section-heading">
                    <span className="section-number">01</span>
                    <div><h2 id="identity-title">Identity</h2><p>Name and describe this configuration.</p></div>
                  </div>
                  <div className="identity-fields">
                    <label className="field field-name" htmlFor="strategy-name">
                      <span>Strategy name <b aria-hidden="true">*</b></span>
                      <input id="strategy-name" aria-invalid={nameError} aria-describedby={nameError ? 'strategy-name-error' : undefined} value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} required maxLength={200} autoFocus={editable} />
                      {nameError && <small className="field-error" id="strategy-name-error">{formError}</small>}
                    </label>
                    <label className="field" htmlFor="strategy-description">
                      <span>Description</span>
                      <textarea
                        id="strategy-description"
                        rows={3}
                        aria-invalid={descriptionError}
                        aria-describedby={descriptionError ? 'strategy-description-error' : undefined}
                        value={draft.description}
                        onChange={(event) => updateDraft('description', event.target.value)}
                        maxLength={10000}
                      />
                      {descriptionError && (
                        <small className="field-error" id="strategy-description-error">
                          {formError}
                        </small>
                      )}
                    </label>
                  </div>
                  <div className="version-fields">
                    <label className="field" htmlFor="configuration-version">
                      <span>American configuration version <b aria-hidden="true">*</b></span>
                      <input id="configuration-version" aria-invalid={configurationVersionError} aria-describedby={configurationVersionError ? 'configuration-version-error' : undefined} value={draft.rouletteConfiguration.configurationVersion} onChange={(event) => updateDraft('rouletteConfiguration', { ...draft.rouletteConfiguration, configurationVersion: event.target.value })} required maxLength={100} />
                      {configurationVersionError && <small className="field-error" id="configuration-version-error">{formError}</small>}
                    </label>
                    <label className="field" htmlFor="ruleset-version">
                      <span>Ruleset version</span>
                      <input
                        id="ruleset-version"
                        aria-invalid={rulesetVersionError}
                        aria-describedby={rulesetVersionError ? 'ruleset-version-error' : undefined}
                        value={draft.rulesetVersion ?? ''}
                        onChange={(event) => updateDraft('rulesetVersion', event.target.value || null)}
                        maxLength={100}
                        placeholder="Not specified"
                      />
                      {rulesetVersionError && (
                        <small className="field-error" id="ruleset-version-error">
                          {formError}
                        </small>
                      )}
                    </label>
                    <div className="field fixed-wheel"><span>Wheel</span><strong>American</strong><small>Fixed by schema 1.0</small></div>
                  </div>
                </section>

                <section className="form-section configuration-section" aria-labelledby="configuration-title">
                  <div className="section-heading">
                    <span className="section-number">02</span>
                    <div><h2 id="configuration-title">Configuration</h2><p>Opaque JSON values are preserved as document data.</p></div>
                  </div>
                  <div className="json-grid">
                    {JSON_FIELDS.map(({ key, label, hint }) => (
                      <label className={`field json-field json-${key}`} htmlFor={`json-${key}`} key={key}>
                        <span className="json-label-row"><span id={`json-title-${key}`}>{label}</span><span className="json-type">JSON</span></span>
                        <small>{hint}</small>
                        <textarea
                          id={`json-${key}`}
                          className="json-editor"
                          spellCheck={false}
                          aria-labelledby={`json-title-${key}`}
                          aria-invalid={jsonErrorFor(key)}
                          aria-describedby={`json-hint-${key}${jsonErrorFor(key) ? ` json-error-${key}` : ''}`}
                          value={jsonDraft?.[key] ?? ''}
                          onChange={(event) => { setFormError(null); setJsonDraft((current) => current ? { ...current, [key]: event.target.value } : current); }}
                          rows={key === 'rules' || key === 'recoveryRules' ? 8 : 6}
                        />
                        <span className="visually-hidden" id={`json-hint-${key}`}>{hint} Valid JSON is required before saving.</span>
                        {jsonErrorFor(key) && <small className="field-error" id={`json-error-${key}`}>{formError}</small>}
                      </label>
                    ))}
                  </div>
                </section>

                <section className="execution-note" aria-label="Execution status">
                  <span className="execution-icon" aria-hidden="true">Ⅱ</span>
                  <div><strong>Configuration only — not executable</strong><p>Strategy specifications are not defined in this release. This document will remain schema 1.0 and non-runnable.</p></div>
                  <span className="execution-status">NON-RUNNABLE</span>
                </section>
              </fieldset>
              {editable && (
                <div className="form-bottom-actions">
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => requestNavigation({ kind: 'cancel' })}
                  >
                    Cancel changes
                  </button>
                  <button type="submit" className="button button-primary">
                    Save strategy <span aria-hidden="true">↗</span>
                  </button>
                </div>
              )}
            </form>
          )}
          <footer className="page-footer"><span>LOCAL STRATEGY DOCUMENTS</span><span>SCHEMA 1.0 <i>·</i> EXECUTION DISABLED</span></footer>
        </section>
      </div>
    </main>
  );
}
