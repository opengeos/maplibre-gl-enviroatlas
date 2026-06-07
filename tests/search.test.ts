import { describe, it, expect } from 'vitest';
import { filterCatalog } from '../src/lib/api/search';
import type { ServiceMetadata, ServiceRef } from '../src/lib/api/types';

const services: ServiceRef[] = [
  { folder: 'Communities', name: 'Community_BGmetrics', fullName: 'Communities/Community_BGmetrics', type: 'MapServer' },
  { folder: 'Supplemental', name: 'PADUS', fullName: 'Supplemental/PADUS', type: 'MapServer' },
  { folder: 'Rasters', name: 'Forest_connectivity_CONUS_2024', fullName: 'Rasters/Forest_connectivity_CONUS_2024', type: 'ImageServer' },
];

const metadata: ServiceMetadata = {
  mapName: 'Map',
  layers: [
    { id: 0, name: 'Census Block Group boundaries', parentLayerId: -1, subLayerIds: null },
    { id: 1, name: 'Metrics by Census Block Group', parentLayerId: -1, subLayerIds: [2, 3] },
    { id: 2, name: 'Percent tree cover', parentLayerId: 1, subLayerIds: null },
    { id: 3, name: 'Asthma exacerbation avoided due to tree cover (cases/yr)', parentLayerId: 1, subLayerIds: null },
  ],
};

const layerCache = new Map<string, ServiceMetadata>([['Communities/Community_BGmetrics', metadata]]);

describe('filterCatalog', () => {
  it('returns empty results for an empty query', () => {
    expect(filterCatalog('', services, layerCache)).toEqual([]);
    expect(filterCatalog('   ', services, layerCache)).toEqual([]);
  });

  it('matches service names case-insensitively', () => {
    const results = filterCatalog('padus', services, layerCache);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ kind: 'service', service: services[1] });
  });

  it('treats underscores in service names as spaces', () => {
    const results = filterCatalog('forest connectivity', services, layerCache);
    expect(results.some((r) => r.kind === 'service' && r.service.type === 'ImageServer')).toBe(true);
  });

  it('matches sublayer names from the layer cache', () => {
    const results = filterCatalog('tree cover', services, layerCache);
    const sublayers = results.filter((r) => r.kind === 'sublayer');
    expect(sublayers).toHaveLength(2);
    expect(sublayers.map((r) => (r.kind === 'sublayer' ? r.layer.id : -1))).toEqual([2, 3]);
  });

  it('requires all terms to match', () => {
    const results = filterCatalog('asthma tree', services, layerCache);
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe('sublayer');
  });

  it('lists service matches before sublayer matches', () => {
    const results = filterCatalog('census', services, layerCache);
    expect(results.every((r) => r.kind === 'sublayer')).toBe(true);

    const mixed = filterCatalog('community', services, layerCache);
    expect(mixed[0].kind).toBe('service');
  });

  it('works with an empty layer cache', () => {
    const results = filterCatalog('tree cover', services, new Map());
    expect(results).toEqual([]);
  });

  it('honors the result limit', () => {
    const results = filterCatalog('e', services, layerCache, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
