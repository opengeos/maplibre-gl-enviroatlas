/**
 * "Added layers" management section: visibility, opacity, legend,
 * and removal for each layer added through the control.
 */
import type { CatalogClient } from '../api/catalog';
import type { AddedLayer } from '../core/types';
import { el, iconButton } from './dom';
import { renderLegend } from './legendView';

const LEGEND_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"><line x1="8" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="8" y1="18" x2="20" y2="18"/><rect x="3" y="5" width="2" height="2"/><rect x="3" y="11" width="2" height="2"/><rect x="3" y="17" width="2" height="2"/></svg>';

const TRASH_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

/**
 * Callbacks and dependencies for the added layers view.
 */
export interface AddedLayersViewContext {
  /** Catalog client used to fetch legends */
  catalog: CatalogClient;
  /** Called when the user toggles layer visibility */
  onVisibilityChange: (id: string, visible: boolean) => void;
  /** Called when the user changes layer opacity */
  onOpacityChange: (id: string, opacity: number) => void;
  /** Called when the user removes a layer */
  onRemove: (id: string) => void;
}

/**
 * The added layers view instance.
 */
export interface AddedLayersView {
  /** Root element to insert into the panel */
  el: HTMLElement;
  /** Re-renders the section for the given layers */
  update: (layers: AddedLayer[]) => void;
}

/**
 * Creates the added layers management section.
 *
 * @param ctx - Dependencies and callbacks
 * @returns The added layers view instance
 */
export function createAddedLayersView(ctx: AddedLayersViewContext): AddedLayersView {
  const root = el('div', 'enviroatlas-added');
  const heading = el('div', 'enviroatlas-section-title', 'Added layers');
  const list = el('div', 'enviroatlas-added-list');
  root.append(heading, list);

  const expandedLegends = new Set<string>();

  function renderRow(layer: AddedLayer): HTMLElement {
    const wrapper = el('div', 'enviroatlas-added-item');
    const row = el('div', 'enviroatlas-row enviroatlas-added-row');

    const visibility = el('input', 'enviroatlas-visibility');
    visibility.type = 'checkbox';
    visibility.checked = layer.visible;
    visibility.title = layer.visible ? 'Hide layer' : 'Show layer';
    visibility.setAttribute('aria-label', `Toggle visibility of ${layer.label}`);
    visibility.addEventListener('change', () => ctx.onVisibilityChange(layer.id, visibility.checked));

    const label = el('span', 'enviroatlas-row-name', layer.label);
    label.title = `${layer.service.fullName}${layer.sublayerId !== undefined ? ` (layer ${layer.sublayerId})` : ''}`;

    const legendBtn = iconButton('enviroatlas-icon-btn enviroatlas-legend-btn', `Toggle legend for ${layer.label}`, LEGEND_SVG);
    const removeBtn = iconButton('enviroatlas-icon-btn enviroatlas-remove-btn', `Remove ${layer.label}`, TRASH_SVG);
    removeBtn.addEventListener('click', () => ctx.onRemove(layer.id));

    row.append(visibility, label, legendBtn, removeBtn);

    const controls = el('div', 'enviroatlas-added-controls');
    const opacity = el('input', 'enviroatlas-opacity');
    opacity.type = 'range';
    opacity.min = '0';
    opacity.max = '100';
    opacity.step = '1';
    opacity.value = String(Math.round(layer.opacity * 100));
    opacity.setAttribute('aria-label', `Opacity of ${layer.label}`);
    const opacityValue = el('span', 'enviroatlas-opacity-value', `${Math.round(layer.opacity * 100)}%`);
    opacity.addEventListener('input', () => {
      opacityValue.textContent = `${opacity.value}%`;
      ctx.onOpacityChange(layer.id, Number(opacity.value) / 100);
    });
    controls.append(el('span', 'enviroatlas-opacity-label', 'Opacity'), opacity, opacityValue);

    const legendContainer = el('div', 'enviroatlas-legend');
    legendContainer.hidden = !expandedLegends.has(layer.id);
    if (!legendContainer.hidden) {
      renderLegend(legendContainer, layer, ctx.catalog);
    }
    legendBtn.classList.toggle('active', !legendContainer.hidden);
    legendBtn.addEventListener('click', () => {
      const show = legendContainer.hidden === true;
      legendContainer.hidden = !show;
      legendBtn.classList.toggle('active', show);
      if (show) {
        expandedLegends.add(layer.id);
        renderLegend(legendContainer, layer, ctx.catalog);
      } else {
        expandedLegends.delete(layer.id);
      }
    });

    wrapper.append(row, controls, legendContainer);
    return wrapper;
  }

  function update(layers: AddedLayer[]): void {
    list.replaceChildren();
    for (const id of [...expandedLegends]) {
      if (!layers.some((layer) => layer.id === id)) expandedLegends.delete(id);
    }
    if (layers.length === 0) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    for (const layer of layers) {
      list.append(renderRow(layer));
    }
  }

  update([]);
  return { el: root, update };
}
