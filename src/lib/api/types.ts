/**
 * Types describing the EPA EnviroAtlas ArcGIS REST services catalog.
 *
 * @see https://www.epa.gov/enviroatlas/enviroatlas-web-services
 */

/**
 * The kind of ArcGIS service exposed by the EnviroAtlas server.
 */
export type ServiceType = 'MapServer' | 'ImageServer';

/**
 * A reference to a single ArcGIS service in the catalog.
 */
export interface ServiceRef {
  /** Folder the service lives in (e.g. "Communities") */
  folder: string;
  /** Short service name without the folder prefix (e.g. "Community_BGmetrics") */
  name: string;
  /** Full service name as returned by the server (e.g. "Communities/Community_BGmetrics") */
  fullName: string;
  /** The ArcGIS service type */
  type: ServiceType;
}

/**
 * A single layer inside a MapServer service.
 */
export interface ServiceLayer {
  /** Numeric layer id used in `layers=show:{id}` export requests */
  id: number;
  /** Human readable layer name */
  name: string;
  /** Parent layer id, -1 for root layers */
  parentLayerId: number;
  /** Child layer ids when this is a group layer */
  subLayerIds: number[] | null;
}

/**
 * Metadata for a MapServer service (subset of the ArcGIS JSON response).
 */
export interface ServiceMetadata {
  /** Display name reported by the server */
  mapName?: string;
  /** Service description */
  description?: string;
  /** Flat list of layers (empty for ImageServers) */
  layers: ServiceLayer[];
}

/**
 * A single legend swatch entry for a layer.
 */
export interface LegendEntry {
  /** Legend label text */
  label: string;
  /** Base64-encoded PNG image data */
  imageData: string;
  /** Image content type (e.g. "image/png") */
  contentType: string;
  /** Swatch width in pixels */
  width: number;
  /** Swatch height in pixels */
  height: number;
}

/**
 * Legend information for one layer of a service.
 */
export interface LayerLegend {
  /** The layer id within the service */
  layerId: number;
  /** The layer name */
  layerName: string;
  /** Legend swatches for the layer */
  legend: LegendEntry[];
}

/**
 * A search result entry. Either a whole service or a single
 * sublayer within a MapServer service.
 */
export type SearchResult =
  | {
      kind: 'service';
      service: ServiceRef;
    }
  | {
      kind: 'sublayer';
      service: ServiceRef;
      layer: ServiceLayer;
    };
