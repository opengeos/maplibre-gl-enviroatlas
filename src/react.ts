// React entry point
export { EnviroAtlasControlReact } from './lib/core/EnviroAtlasControlReact';

// React hooks
export { useEnviroAtlas } from './lib/hooks';

// Re-export types for React consumers
export type {
  EnviroAtlasControlOptions,
  EnviroAtlasState,
  EnviroAtlasTheme,
  EnviroAtlasControlReactProps,
  EnviroAtlasControlEvent,
  EnviroAtlasControlEventData,
  EnviroAtlasControlEventHandler,
  AddedLayer,
} from './lib/core/types';
export type {
  ServiceType,
  ServiceRef,
  ServiceLayer,
  ServiceMetadata,
  LegendEntry,
  LayerLegend,
  SearchResult,
} from './lib/api';
