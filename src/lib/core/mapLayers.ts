import type { ImageSource, Map as MapLibreMap, RasterSourceSpecification } from 'maplibre-gl';
import { intersectBounds, lngLatToMercator } from '../api/extent';
import type { LngLatBoundsArray } from '../api/extent';
import type { ServiceRef } from '../api/types';
import { buildTileTemplate, buildViewExportUrl } from '../api/urls';
import { generateId } from '../utils/helpers';
import type { AddedLayer } from './types';

/** How each added layer is rendered */
export type RenderMode = 'image' | 'tiles';

/** Maximum pixels requested per export axis */
const MAX_IMAGE_SIZE = 2048;

/** 1x1 transparent PNG shown when a layer is outside the current view */
const BLANK_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Geographic bounds of the Web Mercator world */
const WORLD_BOUNDS: LngLatBoundsArray = [-180, -85.051129, 180, 85.051129];

/**
 * Options for creating a {@link MapLayerManager}.
 */
export interface MapLayerManagerOptions {
  /** ArcGIS REST services root */
  servicesUrl: string;
  /** Raster tile size in pixels (tiles mode) */
  tileSize: number;
  /** ArcGIS export image format */
  imageFormat: string;
  /** Attribution attached to raster sources */
  attribution: string;
  /**
   * How layers are rendered. 'image' issues a single export request
   * per map view (fast against dynamic ArcGIS services); 'tiles'
   * requests one export per 256px tile.
   */
  renderMode: RenderMode;
  /** Existing layer id to insert added layers before (skipped when absent) */
  beforeId?: string;
}

/**
 * Manages MapLibre raster sources and layers created from
 * EnviroAtlas services. Pure map mutation, no UI concerns.
 */
export class MapLayerManager {
  private readonly _map: MapLibreMap;
  private readonly _options: MapLayerManagerOptions;
  private readonly _layers = new globalThis.Map<string, AddedLayer>();
  private _viewHandler: (() => void) | null = null;

  /**
   * Creates a manager bound to a map instance.
   *
   * @param map - The MapLibre GL map
   * @param options - Source creation options
   */
  constructor(map: MapLibreMap, options: MapLayerManagerOptions) {
    this._map = map;
    this._options = options;
  }

  /** All layers currently managed, in insertion order. */
  getLayers(): AddedLayer[] {
    return [...this._layers.values()];
  }

  /**
   * Finds an existing entry for the same service and sublayer.
   *
   * @param service - The service reference
   * @param sublayerId - Optional sublayer id
   * @returns The matching entry or undefined
   */
  findLayer(service: ServiceRef, sublayerId?: number): AddedLayer | undefined {
    return this.getLayers().find(
      (layer) => layer.service.fullName === service.fullName && layer.sublayerId === sublayerId
    );
  }

  /**
   * Adds a service (or a single MapServer sublayer) to the map.
   *
   * In 'image' mode (default) a single export request covers the
   * visible map area and is refreshed when the view settles; in
   * 'tiles' mode a raster tile source requests one export per tile.
   *
   * @param service - The service to add
   * @param label - Display label for the added layer
   * @param sublayerId - Optional MapServer sublayer id
   * @param opacity - Initial raster opacity (0 to 1)
   * @param bounds - Optional geographic bounds limiting requests
   * @returns The created added-layer entry
   */
  addLayer(
    service: ServiceRef,
    label: string,
    sublayerId?: number,
    opacity = 1,
    bounds?: LngLatBoundsArray
  ): AddedLayer {
    const id = generateId('enviroatlas');
    const entry: AddedLayer = {
      id,
      sourceId: id,
      layerId: id,
      service,
      sublayerId,
      label,
      visible: true,
      opacity,
      bounds,
    };

    this._createSource(entry);
    this._createLayer(entry);

    this._layers.set(id, entry);
    return entry;
  }

  /**
   * Re-registers a previously persisted layer, reusing native source
   * and layer objects the host application may have already recreated.
   *
   * Host applications that persist {@link AddedLayer} entries (for
   * example in a saved project) often recreate the native MapLibre
   * source and layer themselves before re-activating the control. This
   * method hands those layers back to the manager without duplicating
   * the natives: existing source/layer objects are kept and only the
   * missing ones are created, while opacity and visibility are
   * reconciled to match the entry.
   *
   * @param entry - The persisted added-layer entry to restore
   * @returns The tracked added-layer entry (an existing one when the id
   *   was already managed, otherwise the newly registered copy)
   */
  restoreLayer(entry: AddedLayer): AddedLayer {
    const existing = this._layers.get(entry.id);
    if (existing) return existing;

    const copy: AddedLayer = { ...entry };

    if (!this._map.getSource(copy.sourceId)) {
      this._createSource(copy);
    } else if (this._options.renderMode === 'image') {
      // The host recreated the source; still ensure the shared view
      // listener that refreshes image layers is registered.
      this._ensureViewHandler();
    }

    if (!this._map.getLayer(copy.layerId)) {
      this._createLayer(copy);
    } else {
      // The host recreated the native layer; reconcile paint and layout
      // so manager state and the map agree.
      this._map.setPaintProperty(copy.layerId, 'raster-opacity', copy.opacity);
      this._map.setLayoutProperty(copy.layerId, 'visibility', copy.visible ? 'visible' : 'none');
    }

    this._layers.set(copy.id, copy);
    return copy;
  }

  /**
   * Creates the native MapLibre source for an added layer according to
   * the current render mode.
   *
   * @param entry - The added layer to create a source for
   */
  private _createSource(entry: AddedLayer): void {
    if (this._options.renderMode === 'image') {
      const view = this._computeView(entry);
      this._map.addSource(entry.sourceId, {
        type: 'image',
        url: view?.url ?? BLANK_IMAGE,
        coordinates: view?.coordinates ?? [
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      });
      this._ensureViewHandler();
    } else {
      const tileTemplate = buildTileTemplate(
        entry.service,
        entry.sublayerId,
        { tileSize: this._options.tileSize, imageFormat: this._options.imageFormat },
        this._options.servicesUrl
      );
      const source: RasterSourceSpecification = {
        type: 'raster',
        tiles: [tileTemplate],
        tileSize: this._options.tileSize,
        attribution: this._options.attribution,
      };
      // Bounds keep MapLibre from requesting tiles far outside the data
      // extent, which the EnviroAtlas server answers with slow 504s.
      if (entry.bounds) source.bounds = entry.bounds;
      this._map.addSource(entry.sourceId, source);
    }
  }

  /**
   * Creates the native MapLibre raster layer for an added layer,
   * removing the source if layer creation fails.
   *
   * @param entry - The added layer to create a layer for
   */
  private _createLayer(entry: AddedLayer): void {
    // Insert below the configured layer when it exists on the map
    const beforeId =
      this._options.beforeId && this._map.getLayer(this._options.beforeId) ? this._options.beforeId : undefined;
    try {
      this._map.addLayer(
        {
          id: entry.layerId,
          type: 'raster',
          source: entry.sourceId,
          paint: {
            'raster-opacity': entry.opacity,
            // Image-mode sources swap the whole picture on view changes;
            // fading would flash the old extent during the swap.
            ...(this._options.renderMode === 'image' ? { 'raster-fade-duration': 0 } : {}),
          },
          layout: { visibility: entry.visible ? 'visible' : 'none' },
        },
        beforeId
      );
    } catch (error) {
      // Avoid orphaning the source when layer creation fails
      if (this._map.getSource(entry.sourceId)) {
        this._map.removeSource(entry.sourceId);
      }
      throw error;
    }
  }

  /**
   * Removes a managed layer and its source from the map.
   *
   * @param id - The added-layer id
   * @returns The removed entry or undefined when unknown
   */
  removeLayer(id: string): AddedLayer | undefined {
    const entry = this._layers.get(id);
    if (!entry) return undefined;

    if (this._map.getLayer(entry.layerId)) {
      this._map.removeLayer(entry.layerId);
    }
    if (this._map.getSource(entry.sourceId)) {
      this._map.removeSource(entry.sourceId);
    }
    this._layers.delete(id);
    if (this._layers.size === 0) {
      this._removeViewHandler();
    }
    return entry;
  }

  /**
   * Updates the raster opacity of a managed layer.
   *
   * @param id - The added-layer id
   * @param opacity - New opacity (0 to 1)
   * @returns The updated entry or undefined when unknown
   */
  setOpacity(id: string, opacity: number): AddedLayer | undefined {
    const entry = this._layers.get(id);
    if (!entry) return undefined;

    entry.opacity = opacity;
    if (this._map.getLayer(entry.layerId)) {
      this._map.setPaintProperty(entry.layerId, 'raster-opacity', opacity);
    }
    return entry;
  }

  /**
   * Toggles the visibility of a managed layer.
   *
   * @param id - The added-layer id
   * @param visible - Whether the layer should be visible
   * @returns The updated entry or undefined when unknown
   */
  setVisibility(id: string, visible: boolean): AddedLayer | undefined {
    const entry = this._layers.get(id);
    if (!entry) return undefined;

    entry.visible = visible;
    if (this._map.getLayer(entry.layerId)) {
      this._map.setLayoutProperty(entry.layerId, 'visibility', visible ? 'visible' : 'none');
    }
    // The image may be stale if the view moved while hidden
    if (visible) {
      this._updateImageLayer(entry);
    }
    return entry;
  }

  /**
   * Changes the layer that added layers are inserted before, moving
   * the already-added layers accordingly.
   *
   * @param beforeId - The target layer id, or undefined for top of map
   */
  setBeforeId(beforeId?: string): void {
    this._options.beforeId = beforeId;
    const valid = beforeId && this._map.getLayer(beforeId) ? beforeId : undefined;
    for (const entry of this._layers.values()) {
      if (this._map.getLayer(entry.layerId)) {
        this._map.moveLayer(entry.layerId, valid);
      }
    }
  }

  /**
   * Removes all managed layers and sources from the map.
   */
  removeAll(): void {
    for (const id of [...this._layers.keys()]) {
      this.removeLayer(id);
    }
  }

  /**
   * Computes the export request and image placement for the current
   * map view, clamped to the layer bounds.
   *
   * @param entry - The added layer
   * @returns The export url and image corner coordinates, or null when
   *   the layer is entirely outside the current view
   */
  private _computeView(
    entry: AddedLayer
  ): { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]] } | null {
    const mapBounds = this._map.getBounds();
    const view: LngLatBoundsArray = [
      Math.max(mapBounds.getWest(), WORLD_BOUNDS[0]),
      Math.max(mapBounds.getSouth(), WORLD_BOUNDS[1]),
      Math.min(mapBounds.getEast(), WORLD_BOUNDS[2]),
      Math.min(mapBounds.getNorth(), WORLD_BOUNDS[3]),
    ];
    const clamped = intersectBounds(view, entry.bounds ?? WORLD_BOUNDS);
    if (!clamped) return null;

    const [xmin, ymin] = lngLatToMercator(clamped[0], clamped[1]);
    const [xmax, ymax] = lngLatToMercator(clamped[2], clamped[3]);
    if (xmin >= xmax || ymin >= ymax) return null;

    // Match the on-screen pixel density of the clamped area
    const container = this._map.getContainer();
    const viewWidth = Math.max(container.clientWidth, 1);
    const [viewXmin] = lngLatToMercator(view[0], view[1]);
    const [viewXmax] = lngLatToMercator(view[2], view[3]);
    const metersPerPixel = (viewXmax - viewXmin) / viewWidth;
    let width = (xmax - xmin) / metersPerPixel;
    let height = (ymax - ymin) / metersPerPixel;
    const scale = Math.min(1, MAX_IMAGE_SIZE / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const url = buildViewExportUrl(
      entry.service,
      entry.sublayerId,
      [xmin, ymin, xmax, ymax],
      width,
      height,
      { imageFormat: this._options.imageFormat },
      this._options.servicesUrl
    );
    return {
      url,
      coordinates: [
        [clamped[0], clamped[3]],
        [clamped[2], clamped[3]],
        [clamped[2], clamped[1]],
        [clamped[0], clamped[1]],
      ],
    };
  }

  /**
   * Refreshes the export image of a single layer for the current view.
   *
   * @param entry - The added layer
   */
  private _updateImageLayer(entry: AddedLayer): void {
    if (this._options.renderMode !== 'image' || !entry.visible) return;
    const source = this._map.getSource(entry.sourceId) as ImageSource | undefined;
    if (!source || typeof source.updateImage !== 'function') return;

    const view = this._computeView(entry);
    if (!view) {
      // Out of view: swap in a blank image so nothing stale lingers
      source.updateImage({
        url: BLANK_IMAGE,
        coordinates: [
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      });
      return;
    }
    source.updateImage({ url: view.url, coordinates: view.coordinates });
  }

  /** Registers the shared view listener that refreshes image layers. */
  private _ensureViewHandler(): void {
    if (this._viewHandler) return;
    this._viewHandler = () => {
      for (const entry of this._layers.values()) {
        this._updateImageLayer(entry);
      }
    };
    this._map.on('moveend', this._viewHandler);
    this._map.on('resize', this._viewHandler);
  }

  /** Removes the shared view listener. */
  private _removeViewHandler(): void {
    if (!this._viewHandler) return;
    this._map.off('moveend', this._viewHandler);
    this._map.off('resize', this._viewHandler);
    this._viewHandler = null;
  }
}
