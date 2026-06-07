/**
 * Legend renderer for added layers.
 *
 * Fetches the service legend lazily and renders base64 swatches.
 * Hidden gracefully when a service exposes no legend.
 */
import type { CatalogClient } from '../api/catalog';
import type { LayerLegend } from '../api/types';
import type { AddedLayer } from '../core/types';
import { el } from './dom';

/**
 * Renders the legend for an added layer into a container.
 *
 * @param container - The element to render into
 * @param layer - The added layer
 * @param catalog - Catalog client used to fetch the legend
 */
export function renderLegend(container: HTMLElement, layer: AddedLayer, catalog: CatalogClient): void {
  container.replaceChildren(el('div', 'enviroatlas-status enviroatlas-status-loading', 'Loading legend...'));

  catalog
    .getLegend(layer.service)
    .then((legends) => {
      container.replaceChildren();
      const relevant = pickLegends(legends, layer.sublayerId);
      if (relevant.length === 0) {
        container.append(el('div', 'enviroatlas-status enviroatlas-status-empty', 'No legend available'));
        return;
      }
      for (const layerLegend of relevant) {
        if (relevant.length > 1) {
          container.append(el('div', 'enviroatlas-legend-layer', layerLegend.layerName));
        }
        for (const entry of layerLegend.legend) {
          const item = el('div', 'enviroatlas-legend-item');
          const swatch = el('img', 'enviroatlas-legend-swatch');
          swatch.src = `data:${entry.contentType};base64,${entry.imageData}`;
          swatch.width = entry.width;
          swatch.height = entry.height;
          swatch.alt = entry.label || 'legend swatch';
          item.append(swatch, el('span', 'enviroatlas-legend-label', entry.label || layerLegend.layerName));
          container.append(item);
        }
      }
    })
    .catch(() => {
      container.replaceChildren(el('div', 'enviroatlas-status enviroatlas-status-empty', 'No legend available'));
    });
}

function pickLegends(legends: LayerLegend[], sublayerId?: number): LayerLegend[] {
  if (sublayerId === undefined) return legends;
  const match = legends.filter((legend) => legend.layerId === sublayerId);
  // Group layers have no legend entries of their own; fall back to all
  return match.length > 0 ? match : legends;
}
