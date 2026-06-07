/**
 * Catalog client for the EnviroAtlas ArcGIS REST services directory.
 *
 * Fetches and caches the folder list, per-folder service lists,
 * per-service layer metadata, and legends. All responses are cached
 * in memory for the lifetime of the client.
 */
import type { LayerLegend, ServiceLayer, ServiceMetadata, ServiceRef, ServiceType } from './types';
import { buildCatalogUrl, buildFolderUrl, buildLegendUrl, buildServiceUrl, DEFAULT_SERVICES_URL } from './urls';

/** Folders hidden from the catalog by default */
export const DEFAULT_EXCLUDED_FOLDERS = ['test_services', 'Utilities', 'monitor'];

/**
 * Options for creating a {@link CatalogClient}.
 */
export interface CatalogClientOptions {
  /** ArcGIS REST services root @default DEFAULT_SERVICES_URL */
  servicesUrl?: string;
  /** Folder names to hide @default DEFAULT_EXCLUDED_FOLDERS */
  excludedFolders?: string[];
  /** Max concurrent requests when prefetching layer lists @default 6 */
  prefetchConcurrency?: number;
}

/**
 * Parses the catalog root response into a folder list, applying exclusions.
 *
 * @param json - The catalog root JSON response
 * @param excludedFolders - Folder names to filter out
 * @returns Folder names sorted alphabetically
 */
export function parseFolderList(json: unknown, excludedFolders: string[] = DEFAULT_EXCLUDED_FOLDERS): string[] {
  const folders = (json as { folders?: unknown })?.folders;
  if (!Array.isArray(folders)) return [];
  const excluded = new Set(excludedFolders.map((f) => f.toLowerCase()));
  return folders
    .filter((f): f is string => typeof f === 'string' && !excluded.has(f.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Parses a folder listing response into service references.
 *
 * @param json - The folder JSON response
 * @param folder - The folder that was listed
 * @returns Service references for supported service types
 */
export function parseServiceList(json: unknown, folder: string): ServiceRef[] {
  const services = (json as { services?: unknown })?.services;
  if (!Array.isArray(services)) return [];
  const refs: ServiceRef[] = [];
  for (const entry of services) {
    const { name, type } = (entry ?? {}) as { name?: unknown; type?: unknown };
    if (typeof name !== 'string' || (type !== 'MapServer' && type !== 'ImageServer')) continue;
    const shortName = name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name;
    refs.push({ folder, name: shortName, fullName: name, type: type as ServiceType });
  }
  return refs;
}

/**
 * Parses a service metadata response into {@link ServiceMetadata}.
 *
 * @param json - The service JSON response
 * @returns Parsed metadata with a normalized layer list
 */
export function parseServiceMetadata(json: unknown): ServiceMetadata {
  const raw = (json ?? {}) as { mapName?: unknown; description?: unknown; layers?: unknown };
  const layers: ServiceLayer[] = [];
  if (Array.isArray(raw.layers)) {
    for (const entry of raw.layers) {
      const { id, name, parentLayerId, subLayerIds } = (entry ?? {}) as Record<string, unknown>;
      if (typeof id !== 'number' || typeof name !== 'string') continue;
      layers.push({
        id,
        name,
        parentLayerId: typeof parentLayerId === 'number' ? parentLayerId : -1,
        subLayerIds: Array.isArray(subLayerIds) ? (subLayerIds as number[]) : null,
      });
    }
  }
  return {
    mapName: typeof raw.mapName === 'string' ? raw.mapName : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    layers,
  };
}

/**
 * Parses a legend response into per-layer legends.
 *
 * @param json - The legend JSON response
 * @returns Legends keyed by layer, empty when unavailable
 */
export function parseLegend(json: unknown): LayerLegend[] {
  const layers = (json as { layers?: unknown })?.layers;
  if (!Array.isArray(layers)) return [];
  const result: LayerLegend[] = [];
  for (const entry of layers) {
    const { layerId, layerName, legend } = (entry ?? {}) as Record<string, unknown>;
    if (typeof layerId !== 'number' || !Array.isArray(legend)) continue;
    result.push({
      layerId,
      layerName: typeof layerName === 'string' ? layerName : `Layer ${layerId}`,
      legend: legend
        .filter((item) => item && typeof (item as Record<string, unknown>).imageData === 'string')
        .map((item) => {
          const raw = item as Record<string, unknown>;
          return {
            label: typeof raw.label === 'string' ? raw.label : '',
            imageData: raw.imageData as string,
            contentType: typeof raw.contentType === 'string' ? raw.contentType : 'image/png',
            width: typeof raw.width === 'number' ? raw.width : 20,
            height: typeof raw.height === 'number' ? raw.height : 20,
          };
        }),
    });
  }
  return result;
}

/**
 * Client for browsing the EnviroAtlas services catalog with caching.
 */
export class CatalogClient {
  private readonly _servicesUrl: string;
  private readonly _excludedFolders: string[];
  private readonly _prefetchConcurrency: number;

  private _folders?: Promise<string[]>;
  private readonly _services = new Map<string, Promise<ServiceRef[]>>();
  private readonly _metadata = new Map<string, Promise<ServiceMetadata>>();
  private readonly _legends = new Map<string, Promise<LayerLegend[]>>();
  private _prefetchAll?: Promise<void>;
  private _abortController = new AbortController();

  /**
   * Creates a new catalog client.
   *
   * @param options - Client configuration
   */
  constructor(options: CatalogClientOptions = {}) {
    this._servicesUrl = options.servicesUrl ?? DEFAULT_SERVICES_URL;
    this._excludedFolders = options.excludedFolders ?? DEFAULT_EXCLUDED_FOLDERS;
    this._prefetchConcurrency = options.prefetchConcurrency ?? 6;
  }

  /** The ArcGIS REST services root this client reads from. */
  get servicesUrl(): string {
    return this._servicesUrl;
  }

  /**
   * Lists catalog folders (cached after the first call).
   *
   * @returns Folder names, excluding configured folders
   */
  listFolders(): Promise<string[]> {
    this._folders ??= this._fetchJson(buildCatalogUrl(this._servicesUrl)).then((json) =>
      parseFolderList(json, this._excludedFolders)
    );
    return this._folders.catch((err) => {
      this._folders = undefined;
      throw err;
    });
  }

  /**
   * Lists services within a folder (cached per folder).
   *
   * @param folder - The folder name
   * @returns Service references in the folder
   */
  listServices(folder: string): Promise<ServiceRef[]> {
    let promise = this._services.get(folder);
    if (!promise) {
      promise = this._fetchJson(buildFolderUrl(folder, this._servicesUrl)).then((json) =>
        parseServiceList(json, folder)
      );
      this._services.set(folder, promise);
    }
    return promise.catch((err) => {
      this._services.delete(folder);
      throw err;
    });
  }

  /**
   * Fetches metadata (layer list) for a service (cached per service).
   *
   * @param service - The service reference
   * @returns Parsed service metadata
   */
  getServiceMetadata(service: ServiceRef): Promise<ServiceMetadata> {
    let promise = this._metadata.get(service.fullName);
    if (!promise) {
      promise = this._fetchJson(buildServiceUrl(service, this._servicesUrl)).then(parseServiceMetadata);
      this._metadata.set(service.fullName, promise);
    }
    return promise.catch((err) => {
      this._metadata.delete(service.fullName);
      throw err;
    });
  }

  /**
   * Returns cached metadata for a service if already fetched.
   *
   * @param service - The service reference
   * @returns The cached metadata promise or undefined
   */
  getCachedMetadata(service: ServiceRef): Promise<ServiceMetadata> | undefined {
    return this._metadata.get(service.fullName);
  }

  /**
   * Fetches the legend for a service (cached per service).
   *
   * @param service - The service reference
   * @returns Per-layer legends, empty when the service has none
   */
  getLegend(service: ServiceRef): Promise<LayerLegend[]> {
    let promise = this._legends.get(service.fullName);
    if (!promise) {
      promise = this._fetchJson(buildLegendUrl(service, this._servicesUrl))
        .then(parseLegend)
        .catch(() => [] as LayerLegend[]);
      this._legends.set(service.fullName, promise);
    }
    return promise;
  }

  /**
   * Lists all services across all folders (cached).
   *
   * @returns All service references in the catalog
   */
  async listAllServices(): Promise<ServiceRef[]> {
    const folders = await this.listFolders();
    const lists = await Promise.all(
      folders.map((folder) => this.listServices(folder).catch(() => [] as ServiceRef[]))
    );
    return lists.flat();
  }

  /**
   * Prefetches layer metadata for all MapServer services so sublayer
   * search has data. Runs once; subsequent calls return the same promise.
   *
   * @param onProgress - Called after each service's metadata resolves
   * @returns A promise resolving when all metadata is fetched
   */
  prefetchAllLayers(onProgress?: () => void): Promise<void> {
    this._prefetchAll ??= (async () => {
      const services = await this.listAllServices();
      const mapServers = services.filter((s) => s.type === 'MapServer');
      const queue = [...mapServers];
      const workers = Array.from({ length: Math.min(this._prefetchConcurrency, queue.length) }, async () => {
        for (let service = queue.shift(); service; service = queue.shift()) {
          await this.getServiceMetadata(service).catch(() => undefined);
          onProgress?.();
        }
      });
      await Promise.all(workers);
    })();
    return this._prefetchAll;
  }

  /**
   * Clears all cached data so the next calls re-fetch from the server.
   */
  clearCache(): void {
    this._folders = undefined;
    this._services.clear();
    this._metadata.clear();
    this._legends.clear();
    this._prefetchAll = undefined;
  }

  /**
   * Aborts all in-flight requests and resets the abort controller.
   */
  abort(): void {
    this._abortController.abort();
    this._abortController = new AbortController();
    this.clearCache();
  }

  private async _fetchJson(url: string): Promise<unknown> {
    const response = await fetch(url, { signal: this._abortController.signal });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}): ${url}`);
    }
    const json = (await response.json()) as { error?: { message?: string } };
    // ArcGIS reports errors in a 200 body
    if (json && typeof json === 'object' && json.error) {
      throw new Error(json.error.message ?? `ArcGIS error: ${url}`);
    }
    return json;
  }
}
