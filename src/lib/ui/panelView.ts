/**
 * Panel skeleton: header, search input, browse region, and a slot
 * for the added layers section.
 */
import { el } from './dom';

/**
 * Options for building the panel skeleton.
 */
export interface PanelViewOptions {
  /** Panel title text */
  title: string;
  /** Panel width in pixels (capped to the viewport via CSS) */
  panelWidth: number;
  /** Called when the close button is clicked */
  onClose: () => void;
  /** Called on every search input change (not debounced) */
  onSearchInput: (query: string) => void;
}

/**
 * References to the panel elements.
 */
export interface PanelView {
  /** The panel root element */
  panel: HTMLElement;
  /** The search input */
  searchInput: HTMLInputElement;
  /** Inline notice element for transient messages */
  notice: HTMLElement;
  /** Scrollable region hosting the tree or search results */
  browse: HTMLElement;
  /** Container for the added layers section */
  addedSlot: HTMLElement;
  /** Drag handle for resizing the panel width */
  resizer: HTMLElement;
  /** "Insert before" layer select */
  beforeSelect: HTMLSelectElement;
}

/**
 * Builds the panel skeleton.
 *
 * @param options - Panel options and callbacks
 * @returns References to the created elements
 */
export function createPanelView(options: PanelViewOptions): PanelView {
  const panel = el('div', 'enviroatlas-panel');
  panel.style.setProperty('--ea-panel-width', `${options.panelWidth}px`);

  // Header with title and close button
  const header = el('div', 'enviroatlas-header');
  const title = el('span', 'enviroatlas-title', options.title);
  const closeBtn = el('button', 'enviroatlas-close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close panel');
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', options.onClose);
  header.append(title, closeBtn);

  // Search input
  const searchWrap = el('div', 'enviroatlas-search');
  const searchInput = el('input', 'enviroatlas-search-input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Search services and layers...';
  searchInput.setAttribute('aria-label', 'Search EnviroAtlas services and layers');
  searchInput.addEventListener('input', () => options.onSearchInput(searchInput.value));
  searchWrap.append(searchInput);

  const notice = el('div', 'enviroatlas-notice');
  notice.hidden = true;

  // "Insert before" select: where newly added layers go in the layer
  // stack (e.g. below a label layer). Populated from the map style.
  const beforeRow = el('div', 'enviroatlas-before-row');
  const beforeLabel = el('span', 'enviroatlas-before-label', 'Insert before');
  const beforeSelect = el('select', 'enviroatlas-before-select');
  beforeSelect.setAttribute('aria-label', 'Insert added layers before this map layer');
  beforeRow.append(beforeLabel, beforeSelect);

  const browse = el('div', 'enviroatlas-browse');
  const addedSlot = el('div', 'enviroatlas-added-slot');

  // Drag handle for resizing the panel width; which edge it sits on
  // depends on the control corner and is set via a panel class.
  const resizer = el('div', 'enviroatlas-resizer');
  resizer.setAttribute('role', 'separator');
  resizer.setAttribute('aria-orientation', 'vertical');
  resizer.setAttribute('aria-label', 'Resize panel');

  panel.append(header, searchWrap, beforeRow, notice, browse, addedSlot, resizer);
  return { panel, searchInput, notice, browse, addedSlot, resizer, beforeSelect };
}
