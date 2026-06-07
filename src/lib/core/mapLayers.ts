import type { Map as MapLibreMap, RasterSourceSpecification } from 'maplibre-gl';
import type { LngLatBoundsArray } from '../api/extent';
import type { ServiceRef } from '../api/types';
import { buildTileTemplate } from '../api/urls';
import { generateId } from '../utils/helpers';
import type { AddedLayer } from './types';

/**
 * Options for creating a {@link MapLayerManager}.
 */
export interface MapLayerManagerOptions {
  /** ArcGIS REST services root */
  servicesUrl: string;
  /** Raster tile size in pixels */
  tileSize: number;
  /** ArcGIS export image format */
  imageFormat: string;
  /** Attribution attached to raster sources */
  attribution: string;
}

/**
 * Manages MapLibre raster sources and layers created from
 * EnviroAtlas services. Pure map mutation, no UI concerns.
 */
export class MapLayerManager {
  private readonly _map: MapLibreMap;
  private readonly _options: MapLayerManagerOptions;
  private readonly _layers = new globalThis.Map<string, AddedLayer>();

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
   * Adds a service (or a single MapServer sublayer) to the map
   * as a raster source and layer.
   *
   * @param service - The service to add
   * @param label - Display label for the added layer
   * @param sublayerId - Optional MapServer sublayer id
   * @param opacity - Initial raster opacity (0 to 1)
   * @param bounds - Optional geographic bounds limiting tile requests
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

    const tileTemplate = buildTileTemplate(
      service,
      sublayerId,
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
    if (bounds) source.bounds = bounds;
    this._map.addSource(entry.sourceId, source);
    try {
      this._map.addLayer({
        id: entry.layerId,
        type: 'raster',
        source: entry.sourceId,
        paint: { 'raster-opacity': opacity },
        layout: { visibility: 'visible' },
      });
    } catch (error) {
      // Avoid orphaning the source when layer creation fails
      if (this._map.getSource(entry.sourceId)) {
        this._map.removeSource(entry.sourceId);
      }
      throw error;
    }

    this._layers.set(id, entry);
    return entry;
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
    return entry;
  }

  /**
   * Removes all managed layers and sources from the map.
   */
  removeAll(): void {
    for (const id of [...this._layers.keys()]) {
      this.removeLayer(id);
    }
  }
}
