import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CatalogClient,
  parseFolderList,
  parseServiceList,
  parseServiceMetadata,
  parseLegend,
} from '../src/lib/api/catalog';
import type { ServiceRef } from '../src/lib/api/types';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const padus: ServiceRef = {
  folder: 'Supplemental',
  name: 'PADUS',
  fullName: 'Supplemental/PADUS',
  type: 'MapServer',
};

describe('parseFolderList', () => {
  it('excludes default folders', () => {
    const folders = parseFolderList({
      folders: ['Communities', 'test_services', 'Utilities', 'monitor', 'National'],
    });
    expect(folders).toEqual(['Communities', 'National']);
  });

  it('respects custom exclusions case-insensitively', () => {
    expect(parseFolderList({ folders: ['A', 'B'] }, ['b'])).toEqual(['A']);
  });

  it('returns empty for malformed input', () => {
    expect(parseFolderList({})).toEqual([]);
    expect(parseFolderList(null)).toEqual([]);
  });
});

describe('parseServiceList', () => {
  it('splits folder-qualified names and keeps supported types', () => {
    const services = parseServiceList(
      {
        services: [
          { name: 'Supplemental/PADUS', type: 'MapServer' },
          { name: 'Supplemental/nlcd_2019_landcover', type: 'ImageServer' },
          { name: 'Supplemental/Some_GP', type: 'GPServer' },
        ],
      },
      'Supplemental'
    );
    expect(services).toEqual([
      { folder: 'Supplemental', name: 'PADUS', fullName: 'Supplemental/PADUS', type: 'MapServer' },
      {
        folder: 'Supplemental',
        name: 'nlcd_2019_landcover',
        fullName: 'Supplemental/nlcd_2019_landcover',
        type: 'ImageServer',
      },
    ]);
  });

  it('returns empty for malformed input', () => {
    expect(parseServiceList({}, 'X')).toEqual([]);
  });
});

describe('parseServiceMetadata', () => {
  it('normalizes the layer list', () => {
    const metadata = parseServiceMetadata({
      mapName: 'Map',
      layers: [
        { id: 0, name: 'Boundaries', parentLayerId: -1, subLayerIds: null },
        { id: 1, name: 'Group', parentLayerId: -1, subLayerIds: [2] },
        { id: 2, name: 'Child', parentLayerId: 1 },
        { name: 'missing id' },
      ],
    });
    expect(metadata.mapName).toBe('Map');
    expect(metadata.layers).toHaveLength(3);
    expect(metadata.layers[1].subLayerIds).toEqual([2]);
    expect(metadata.layers[2].parentLayerId).toBe(1);
  });

  it('handles services without layers (ImageServer)', () => {
    expect(parseServiceMetadata({ name: 'x' }).layers).toEqual([]);
  });
});

describe('parseLegend', () => {
  it('extracts swatches with image data', () => {
    const legends = parseLegend({
      layers: [
        {
          layerId: 0,
          layerName: 'PADUS 2.0',
          legend: [
            { label: 'Park', imageData: 'abc123', contentType: 'image/png', width: 20, height: 20 },
            { label: 'broken', imageData: 42 },
          ],
        },
      ],
    });
    expect(legends).toHaveLength(1);
    expect(legends[0].legend).toHaveLength(1);
    expect(legends[0].legend[0].label).toBe('Park');
  });

  it('returns empty for malformed input', () => {
    expect(parseLegend({})).toEqual([]);
  });
});

describe('CatalogClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists folders and caches the response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ folders: ['Communities', 'test_services'] }));
    const client = new CatalogClient();

    expect(await client.listFolders()).toEqual(['Communities']);
    expect(await client.listFolders()).toEqual(['Communities']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches service metadata per service', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ mapName: 'Map', layers: [] }));
    const client = new CatalogClient();

    await client.getServiceMetadata(padus);
    await client.getServiceMetadata(padus);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.getCachedMetadata(padus)).toBeDefined();
  });

  it('rejects on HTTP errors and retries on the next call', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({ folders: ['Communities'] }));
    const client = new CatalogClient();

    await expect(client.listFolders()).rejects.toThrow('Request failed (500)');
    expect(await client.listFolders()).toEqual(['Communities']);
  });

  it('rejects on ArcGIS body errors', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Invalid token' } }));
    const client = new CatalogClient();

    await expect(client.listServices('Communities')).rejects.toThrow('Invalid token');
  });

  it('resolves legends to empty on failure', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const client = new CatalogClient();

    expect(await client.getLegend(padus)).toEqual([]);
  });

  it('prefetches layer metadata for MapServers only', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/arcgis/rest/services?f=json')) {
        return Promise.resolve(jsonResponse({ folders: ['Supplemental'] }));
      }
      if (url.includes('/Supplemental?f=json')) {
        return Promise.resolve(
          jsonResponse({
            services: [
              { name: 'Supplemental/PADUS', type: 'MapServer' },
              { name: 'Supplemental/nlcd_2019_landcover', type: 'ImageServer' },
            ],
          })
        );
      }
      return Promise.resolve(jsonResponse({ mapName: 'Map', layers: [{ id: 0, name: 'PADUS 2.0', parentLayerId: -1 }] }));
    });

    const client = new CatalogClient();
    const progress = vi.fn();
    await client.prefetchAllLayers(progress);

    // root + folder + 1 MapServer metadata (no ImageServer metadata fetch)
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(progress).toHaveBeenCalledTimes(1);
    const urls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(urls.some((u) => u.includes('nlcd_2019_landcover'))).toBe(false);
  });

  it('passes an abort signal and clears caches on abort', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ folders: ['Communities'] })));
    const client = new CatalogClient();
    await client.listFolders();

    const firstSignal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
    expect(firstSignal).toBeInstanceOf(AbortSignal);

    client.abort();
    expect(firstSignal.aborted).toBe(true);

    await client.listFolders();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondSignal = fetchMock.mock.calls[1][1]?.signal as AbortSignal;
    expect(secondSignal.aborted).toBe(false);
  });
});
