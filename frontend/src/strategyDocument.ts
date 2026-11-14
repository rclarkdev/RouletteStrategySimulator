import { validateStrategyDocument } from './storage';
import type { StrategyDocument } from './storage';

/**
 * Validate and serialize supported strategy fields without adding execution semantics.
 */
export function serializeStrategyDocument(value: unknown): string {
  const validated = validateStrategyDocument(value);
  return JSON.stringify(validated, null, 2);
}

/** Download one portable strategy JSON document without storage or simulation side effects. */
export function downloadStrategyDocument(strategy: StrategyDocument): void {
  const serialized = serializeStrategyDocument(strategy);
  const blob = new Blob([serialized], {
    type: 'application/json;charset=utf-8',
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `${strategy.strategyId}.json`;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
