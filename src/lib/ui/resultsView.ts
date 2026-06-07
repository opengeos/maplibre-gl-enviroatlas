/**
 * Flat search results view shown while a query is active.
 */
import type { SearchResult, ServiceRef } from '../api/types';
import { el, iconButton, PLUS_SVG } from './dom';

/**
 * Callbacks for the results view.
 */
export interface ResultsViewContext {
  /** Called when the user adds a result */
  onAdd: (service: ServiceRef, sublayerId?: number, label?: string) => void;
}

/**
 * The results view instance.
 */
export interface ResultsView {
  /** Root element to insert into the panel */
  el: HTMLElement;
  /** Replaces the rendered results */
  setResults: (results: SearchResult[], note?: string) => void;
  /** Shows a status message instead of results */
  setStatus: (text: string) => void;
}

/**
 * Creates the search results view.
 *
 * @param ctx - Callbacks
 * @returns The results view instance
 */
export function createResultsView(ctx: ResultsViewContext): ResultsView {
  const root = el('div', 'enviroatlas-results');

  function addButton(service: ServiceRef, sublayerId: number | undefined, label: string): HTMLButtonElement {
    const button = iconButton('enviroatlas-add-btn', `Add ${label} to map`, PLUS_SVG);
    button.addEventListener('click', () => ctx.onAdd(service, sublayerId, label));
    return button;
  }

  function setResults(results: SearchResult[], note?: string): void {
    root.replaceChildren();
    if (note) {
      root.append(el('div', 'enviroatlas-status enviroatlas-status-loading', note));
    }
    if (results.length === 0) {
      root.append(el('div', 'enviroatlas-status enviroatlas-status-empty', 'No matching services or layers'));
      return;
    }
    for (const result of results) {
      const row = el('div', 'enviroatlas-row enviroatlas-result-row');
      const text = el('div', 'enviroatlas-result-text');
      if (result.kind === 'service') {
        text.append(
          el('div', 'enviroatlas-row-name', result.service.name),
          el('div', 'enviroatlas-breadcrumb', `${result.service.folder} · ${result.service.type}`)
        );
        row.append(text, addButton(result.service, undefined, result.service.name));
      } else {
        text.append(
          el('div', 'enviroatlas-row-name', result.layer.name),
          el('div', 'enviroatlas-breadcrumb', `${result.service.folder} › ${result.service.name}`)
        );
        row.append(text, addButton(result.service, result.layer.id, result.layer.name));
      }
      const title = result.kind === 'service' ? result.service.fullName : result.layer.name;
      text.title = title;
      root.append(row);
    }
  }

  function setStatus(text: string): void {
    root.replaceChildren(el('div', 'enviroatlas-status enviroatlas-status-loading', text));
  }

  return { el: root, setResults, setStatus };
}
