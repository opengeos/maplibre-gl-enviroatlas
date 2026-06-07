import type { Map } from 'maplibre-gl';
import type { LngLatBoundsArray } from '../api/extent';
import type { ServiceRef } from '../api/types';

/**
 * Color theme for the control UI.
 *
 * - `'light'` and `'dark'` force a palette.
 * - `'auto'` follows the user's `prefers-color-scheme` setting.
 */
export type EnviroAtlasTheme = 'light' | 'dark' | 'auto';

/**
 * Options for configuring the EnviroAtlasControl
 */
export interface EnviroAtlasControlOptions {
  /**
   * Whether the control panel should start collapsed (showing only the toggle button)
   * @default true
   */
  collapsed?: boolean;

  /**
   * Position of the control on the map
   * @default 'top-right'
   */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

  /**
   * Title displayed in the control header
   * @default 'US EPA EnviroAtlas'
   */
  title?: string;

  /**
   * Width of the control panel in pixels (capped to the viewport on small screens)
   * @default 360
   */
  panelWidth?: number;

  /**
   * Custom CSS class name for the control container
   */
  className?: string;

  /**
   * Color theme for the control UI
   * @default 'auto'
   */
  theme?: EnviroAtlasTheme;

  /**
   * ArcGIS REST services root to browse
   * @default 'https://enviroatlas.epa.gov/arcgis/rest/services'
   */
  servicesUrl?: string;

  /**
   * Catalog folders to hide from browsing and search
   * @default ['test_services', 'Utilities', 'monitor']
   */
  excludedFolders?: string[];

  /**
   * Initial opacity for newly added layers (0 to 1)
   * @default 1
   */
  defaultOpacity?: number;

  /**
   * Raster tile size in pixels
   * @default 256
   */
  tileSize?: number;

  /**
   * ArcGIS export image format
   * @default 'png32'
   */
  imageFormat?: string;

  /**
   * Attribution string attached to added raster sources
   * @default 'U.S. EPA EnviroAtlas'
   */
  attribution?: string;

  /**
   * Debounce delay for the search input in milliseconds
   * @default 250
   */
  searchDebounceMs?: number;

  /**
   * Whether to zoom the map to a layer's extent when it is added
   * @default true
   */
  fitBoundsOnAdd?: boolean;

  /**
   * Whether to keep transient EnviroAtlas tile failures out of the
   * console. The EPA server occasionally answers tile requests
   * without CORS headers or with gateway timeouts; with this enabled
   * the control handles the map's error events for EnviroAtlas URLs
   * (emitting its own 'error' event instead) and logs all other map
   * errors as MapLibre would by default.
   * @default true
   */
  quietTileErrors?: boolean;
}

/**
 * A layer that has been added to the map through the control.
 */
export interface AddedLayer {
  /** Unique identifier for this entry */
  id: string;
  /** MapLibre source id */
  sourceId: string;
  /** MapLibre layer id */
  layerId: string;
  /** The EnviroAtlas service the layer comes from */
  service: ServiceRef;
  /** Sublayer id when a single MapServer sublayer was added */
  sublayerId?: number;
  /** Display label shown in the added layers list */
  label: string;
  /** Whether the layer is currently visible */
  visible: boolean;
  /** Current raster opacity (0 to 1) */
  opacity: number;
  /** Geographic bounds of the service data, when known */
  bounds?: LngLatBoundsArray;
}

/**
 * Internal state of the EnviroAtlas control
 */
export interface EnviroAtlasState {
  /**
   * Whether the control panel is currently collapsed
   */
  collapsed: boolean;

  /**
   * Current panel width in pixels
   */
  panelWidth: number;

  /**
   * Current color theme
   */
  theme: EnviroAtlasTheme;

  /**
   * Current search query
   */
  query: string;

  /**
   * Layers added to the map through the control
   */
  addedLayers: AddedLayer[];

  /**
   * Any custom state data
   */
  data?: Record<string, unknown>;
}

/**
 * Props for the React wrapper component
 */
export interface EnviroAtlasControlReactProps extends EnviroAtlasControlOptions {
  /**
   * MapLibre GL map instance
   */
  map: Map;

  /**
   * Callback fired when the control state changes
   */
  onStateChange?: (state: EnviroAtlasState) => void;

  /**
   * Callback fired when a layer is added to the map
   */
  onLayerAdd?: (layer: AddedLayer) => void;

  /**
   * Callback fired when a layer is removed from the map
   */
  onLayerRemove?: (layer: AddedLayer) => void;

  /**
   * Callback fired when a catalog or network error occurs
   */
  onError?: (error: Error) => void;
}

/**
 * Event types emitted by the EnviroAtlas control
 */
export type EnviroAtlasControlEvent =
  | 'collapse'
  | 'expand'
  | 'statechange'
  | 'layeradd'
  | 'layerremove'
  | 'layerchange'
  | 'error';

/**
 * Payload passed to event handlers.
 */
export interface EnviroAtlasControlEventData {
  /** The event type */
  type: EnviroAtlasControlEvent;
  /** A snapshot of the control state */
  state: EnviroAtlasState;
  /** The affected layer for layer events */
  layer?: AddedLayer;
  /** The error for 'error' events */
  error?: Error;
}

/**
 * Event handler function type
 */
export type EnviroAtlasControlEventHandler = (event: EnviroAtlasControlEventData) => void;
