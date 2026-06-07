// Import styles
import './lib/styles/enviroatlas-control.css';

// Main entry point - Core exports
export { EnviroAtlasControl } from './lib/core/EnviroAtlasControl';
export { MapLayerManager } from './lib/core/mapLayers';
export type { MapLayerManagerOptions, RenderMode } from './lib/core/mapLayers';

// Type exports
export type {
  EnviroAtlasControlOptions,
  EnviroAtlasState,
  EnviroAtlasTheme,
  EnviroAtlasControlEvent,
  EnviroAtlasControlEventData,
  EnviroAtlasControlEventHandler,
  EnviroAtlasControlReactProps,
  AddedLayer,
} from './lib/core/types';

// EnviroAtlas API exports (catalog client, URL builders, search)
export {
  CatalogClient,
  DEFAULT_EXCLUDED_FOLDERS,
  parseFolderList,
  parseServiceList,
  parseServiceMetadata,
  parseLegend,
  filterCatalog,
  DEFAULT_SERVICES_URL,
  BBOX_PLACEHOLDER,
  buildCatalogUrl,
  buildFolderUrl,
  buildServiceUrl,
  buildLegendUrl,
  buildExportUrl,
  buildExportImageUrl,
  buildTileTemplate,
} from './lib/api';
export type {
  CatalogClientOptions,
  ExportUrlOptions,
  ServiceType,
  ServiceRef,
  ServiceLayer,
  ServiceMetadata,
  LegendEntry,
  LayerLegend,
  SearchResult,
} from './lib/api';

// Utility exports
export {
  clamp,
  formatNumericValue,
  generateId,
  debounce,
  throttle,
  classNames,
} from './lib/utils';
