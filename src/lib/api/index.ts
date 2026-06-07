export type {
  ServiceType,
  ServiceRef,
  ServiceLayer,
  ServiceMetadata,
  LegendEntry,
  LayerLegend,
  SearchResult,
} from './types';

export {
  DEFAULT_SERVICES_URL,
  BBOX_PLACEHOLDER,
  buildCatalogUrl,
  buildFolderUrl,
  buildServiceUrl,
  buildLegendUrl,
  buildExportUrl,
  buildExportImageUrl,
  buildTileTemplate,
} from './urls';
export type { ExportUrlOptions } from './urls';

export {
  CatalogClient,
  DEFAULT_EXCLUDED_FOLDERS,
  parseFolderList,
  parseServiceList,
  parseServiceMetadata,
  parseLegend,
} from './catalog';
export type { CatalogClientOptions } from './catalog';

export { filterCatalog } from './search';

export { extentToBounds, resolveProjection } from './extent';
export type { ArcGISExtent, LngLatBoundsArray } from './extent';
