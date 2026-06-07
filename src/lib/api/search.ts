/**
 * Pure search helpers over the EnviroAtlas catalog.
 */
import type { SearchResult, ServiceMetadata, ServiceRef } from './types';

/**
 * Normalizes a service or layer name for matching: lowercase with
 * underscores treated as spaces.
 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/_/g, ' ');
}

/**
 * Filters the catalog against a search query.
 *
 * Matches are case-insensitive substring matches against service
 * names (folder-qualified) and, when layer metadata is available in
 * `layerCache`, sublayer names within MapServer services.
 *
 * @param query - The raw user query
 * @param services - All known service references
 * @param layerCache - Resolved metadata keyed by service fullName
 * @param limit - Maximum number of results @default 200
 * @returns Matching services first, then matching sublayers
 */
export function filterCatalog(
  query: string,
  services: ServiceRef[],
  layerCache: ReadonlyMap<string, ServiceMetadata>,
  limit = 200
): SearchResult[] {
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const matches = (text: string): boolean => {
    const normalized = normalize(text);
    return terms.every((term) => normalized.includes(term));
  };

  const serviceResults: SearchResult[] = [];
  const sublayerResults: SearchResult[] = [];

  for (const service of services) {
    if (matches(`${service.folder} ${service.name}`)) {
      serviceResults.push({ kind: 'service', service });
    }
    const metadata = layerCache.get(service.fullName);
    if (!metadata) continue;
    for (const layer of metadata.layers) {
      if (matches(layer.name)) {
        sublayerResults.push({ kind: 'sublayer', service, layer });
      }
    }
  }

  return [...serviceResults, ...sublayerResults].slice(0, limit);
}
