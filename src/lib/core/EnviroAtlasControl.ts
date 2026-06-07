import type { IControl, Map as MapLibreMap } from 'maplibre-gl';
import { CatalogClient, DEFAULT_EXCLUDED_FOLDERS } from '../api/catalog';
import { extentToBounds } from '../api/extent';
import { filterCatalog } from '../api/search';
import type { ServiceMetadata, ServiceRef } from '../api/types';
import { DEFAULT_SERVICES_URL } from '../api/urls';
import { createAddedLayersView, createPanelView, createResultsView, createTreeView } from '../ui';
import type { AddedLayersView, PanelView, ResultsView, TreeView } from '../ui';
import { clamp, debounce } from '../utils/helpers';
import { MapLayerManager } from './mapLayers';
import type {
  AddedLayer,
  EnviroAtlasControlEvent,
  EnviroAtlasControlEventHandler,
  EnviroAtlasControlOptions,
  EnviroAtlasState,
  EnviroAtlasTheme,
} from './types';

/**
 * Default options for the EnviroAtlasControl
 */
const DEFAULT_OPTIONS: Required<EnviroAtlasControlOptions> = {
  collapsed: true,
  position: 'top-right',
  title: 'US EPA EnviroAtlas',
  panelWidth: 360,
  className: '',
  theme: 'auto',
  servicesUrl: DEFAULT_SERVICES_URL,
  excludedFolders: DEFAULT_EXCLUDED_FOLDERS,
  defaultOpacity: 1,
  tileSize: 256,
  imageFormat: 'png32',
  attribution: 'U.S. EPA EnviroAtlas',
  searchDebounceMs: 250,
  fitBoundsOnAdd: true,
  quietTileErrors: true,
};

/**
 * Event handlers map type
 */
type EventHandlersMap = globalThis.Map<EnviroAtlasControlEvent, Set<EnviroAtlasControlEventHandler>>;

/**
 * A MapLibre GL control for searching and adding EPA EnviroAtlas
 * web services to the map.
 *
 * The control renders as a 29x29 toggle button (matching the
 * navigation control) that expands into a floating panel with a
 * catalog tree, search, and a management section for added layers.
 *
 * @example
 * ```typescript
 * const control = new EnviroAtlasControl({
 *   collapsed: false,
 *   theme: 'auto',
 * });
 * map.addControl(control, 'top-right');
 * control.on('layeradd', (event) => console.log('Added', event.layer));
 * ```
 */
export class EnviroAtlasControl implements IControl {
  private _map?: MapLibreMap;
  private _mapContainer?: HTMLElement;
  private _container?: HTMLElement;
  private _panel?: HTMLElement;
  private _options: Required<EnviroAtlasControlOptions>;
  private _state: EnviroAtlasState;
  private _eventHandlers: EventHandlersMap = new globalThis.Map();

  private _catalog?: CatalogClient;
  private _layerManager?: MapLayerManager;
  private _panelView?: PanelView;
  private _treeView?: TreeView;
  private _resultsView?: ResultsView;
  private _addedView?: AddedLayersView;

  /** Resolved layer metadata available for synchronous search */
  private readonly _metadataCache = new globalThis.Map<string, ServiceMetadata>();
  private _allServices: ServiceRef[] = [];
  private _prefetchStarted = false;
  private _searchEpoch = 0;
  private _noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private _debouncedSearch?: (query: string) => void;

  // Panel positioning handlers
  private _resizeHandler: (() => void) | null = null;
  private _mapResizeHandler: (() => void) | null = null;
  private _clickOutsideHandler: ((e: MouseEvent) => void) | null = null;
  private _clickCaptureHandler: ((e: MouseEvent) => void) | null = null;
  private _mapErrorHandler: ((e: { error?: Error }) => void) | null = null;
  /** Whether the panel was expanded when the current click dispatch began */
  private _expandedAtClickStart = false;

  /**
   * Creates a new EnviroAtlasControl instance.
   *
   * @param options - Configuration options for the control
   */
  constructor(options?: Partial<EnviroAtlasControlOptions>) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
    this._state = {
      collapsed: this._options.collapsed,
      panelWidth: this._options.panelWidth,
      theme: this._options.theme,
      query: '',
      addedLayers: [],
      data: {},
    };
  }

  /**
   * Called when the control is added to the map.
   * Implements the IControl interface.
   *
   * @param map - The MapLibre GL map instance
   * @returns The control's container element
   */
  onAdd(map: MapLibreMap): HTMLElement {
    this._map = map;
    this._mapContainer = map.getContainer();
    this._catalog = new CatalogClient({
      servicesUrl: this._options.servicesUrl,
      excludedFolders: this._options.excludedFolders,
    });
    this._layerManager = new MapLayerManager(map, {
      servicesUrl: this._options.servicesUrl,
      tileSize: this._options.tileSize,
      imageFormat: this._options.imageFormat,
      attribution: this._options.attribution,
    });
    this._debouncedSearch = debounce(
      (...args: unknown[]) => this._runSearch(args[0] as string),
      this._options.searchDebounceMs
    );

    this._container = this._createContainer();
    this._panel = this._createPanel();
    this._applyTheme();

    // Append panel to map container for independent positioning (avoids overlap with other controls)
    this._mapContainer.appendChild(this._panel);

    // Setup event listeners for panel positioning and click-outside
    this._setupEventListeners();

    // Set initial panel state
    if (!this._state.collapsed) {
      this._panel.classList.add('expanded');
      this._treeView?.load();
      // Update position after control is added to DOM
      requestAnimationFrame(() => {
        this._updatePanelPosition();
      });
    }

    return this._container;
  }

  /**
   * Called when the control is removed from the map.
   * Implements the IControl interface.
   */
  onRemove(): void {
    // Remove event listeners
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._mapResizeHandler && this._map) {
      this._map.off('resize', this._mapResizeHandler);
      this._mapResizeHandler = null;
    }
    if (this._mapErrorHandler && this._map) {
      this._map.off('error', this._mapErrorHandler);
      this._mapErrorHandler = null;
    }
    if (this._clickOutsideHandler) {
      document.removeEventListener('click', this._clickOutsideHandler);
      this._clickOutsideHandler = null;
    }
    if (this._clickCaptureHandler) {
      document.removeEventListener('click', this._clickCaptureHandler, true);
      this._clickCaptureHandler = null;
    }
    if (this._noticeTimer) {
      clearTimeout(this._noticeTimer);
      this._noticeTimer = null;
    }

    // Remove added layers and abort in-flight catalog requests
    this._layerManager?.removeAll();
    this._catalog?.abort();
    this._metadataCache.clear();
    this._allServices = [];
    this._prefetchStarted = false;
    this._state.addedLayers = [];

    // Remove panel from map container
    this._panel?.parentNode?.removeChild(this._panel);

    // Remove button container from control stack
    this._container?.parentNode?.removeChild(this._container);

    this._map = undefined;
    this._mapContainer = undefined;
    this._container = undefined;
    this._panel = undefined;
    this._panelView = undefined;
    this._treeView = undefined;
    this._resultsView = undefined;
    this._addedView = undefined;
    this._layerManager = undefined;
    this._catalog = undefined;
    this._eventHandlers.clear();
  }

  /**
   * Gets the current state of the control.
   *
   * @returns The current control state
   */
  getState(): EnviroAtlasState {
    return { ...this._state, addedLayers: [...this._state.addedLayers] };
  }

  /**
   * Updates the control state.
   *
   * @param newState - Partial state to merge with current state
   */
  setState(newState: Partial<EnviroAtlasState>): void {
    this._state = { ...this._state, ...newState };
    this._emit('statechange');
  }

  /**
   * Toggles the collapsed state of the control panel.
   */
  toggle(): void {
    this._state.collapsed = !this._state.collapsed;

    if (this._panel) {
      if (this._state.collapsed) {
        this._panel.classList.remove('expanded');
        this._emit('collapse');
      } else {
        this._panel.classList.add('expanded');
        this._treeView?.load();
        this._updatePanelPosition();
        this._emit('expand');
      }
    }

    this._emit('statechange');
  }

  /**
   * Expands the control panel.
   */
  expand(): void {
    if (this._state.collapsed) {
      this.toggle();
    }
  }

  /**
   * Collapses the control panel.
   */
  collapse(): void {
    if (!this._state.collapsed) {
      this.toggle();
    }
  }

  /**
   * Sets the color theme of the control.
   *
   * @param theme - The theme to apply
   */
  setTheme(theme: EnviroAtlasTheme): void {
    this._state.theme = theme;
    this._applyTheme();
    this._emit('statechange');
  }

  /**
   * Adds a service (or a single MapServer sublayer) to the map.
   *
   * The service extent is fetched (and cached) to limit tile requests
   * to the data area and, unless `fitBoundsOnAdd` is disabled, to zoom
   * the map to the added layer.
   *
   * @param service - The service to add
   * @param sublayerId - Optional MapServer sublayer id
   * @param label - Optional display label (defaults to the service name)
   * @returns The added layer entry, or the existing entry when already added
   */
  async addServiceLayer(service: ServiceRef, sublayerId?: number, label?: string): Promise<AddedLayer | undefined> {
    if (!this._layerManager) return undefined;

    const existing = this._layerManager.findLayer(service, sublayerId);
    if (existing) {
      this._showNotice(`"${existing.label}" is already on the map`);
      return existing;
    }

    // Resolve the service extent (cached); ignore failures and add
    // the layer without bounds.
    const bounds = await this._catalog
      ?.getServiceMetadata(service)
      .then((metadata) => {
        this._metadataCache.set(service.fullName, metadata);
        return extentToBounds(metadata.extent);
      })
      .catch(() => null);
    // The control may have been removed or the layer added while the
    // metadata request was in flight.
    if (!this._layerManager) return undefined;
    const raced = this._layerManager.findLayer(service, sublayerId);
    if (raced) return raced;

    try {
      const entry = this._layerManager.addLayer(
        service,
        label ?? service.name,
        sublayerId,
        clamp(this._options.defaultOpacity, 0, 1),
        bounds ?? undefined
      );
      this._state.addedLayers = this._layerManager.getLayers();
      this._addedView?.update(this._state.addedLayers);
      this._showNotice(`Added "${entry.label}"`);
      this._emit('layeradd', { layer: entry });
      this._emit('statechange');
      if (this._options.fitBoundsOnAdd && entry.bounds && this._map) {
        this._map.fitBounds(entry.bounds, { padding: 40 });
      }
      return entry;
    } catch (error) {
      this._handleError(error instanceof Error ? error : new Error(String(error)));
      return undefined;
    }
  }

  /**
   * Removes a layer previously added through the control.
   *
   * @param id - The added-layer id
   */
  removeLayer(id: string): void {
    const entry = this._layerManager?.removeLayer(id);
    if (!entry) return;
    this._state.addedLayers = this._layerManager?.getLayers() ?? [];
    this._addedView?.update(this._state.addedLayers);
    this._emit('layerremove', { layer: entry });
    this._emit('statechange');
  }

  /**
   * Sets the opacity of an added layer.
   *
   * @param id - The added-layer id
   * @param opacity - New opacity (0 to 1)
   */
  setLayerOpacity(id: string, opacity: number): void {
    const entry = this._layerManager?.setOpacity(id, clamp(opacity, 0, 1));
    if (!entry) return;
    this._state.addedLayers = this._layerManager?.getLayers() ?? [];
    this._emit('layerchange', { layer: entry });
    this._emit('statechange');
  }

  /**
   * Sets the visibility of an added layer.
   *
   * @param id - The added-layer id
   * @param visible - Whether the layer should be visible
   */
  setLayerVisibility(id: string, visible: boolean): void {
    const entry = this._layerManager?.setVisibility(id, visible);
    if (!entry) return;
    this._state.addedLayers = this._layerManager?.getLayers() ?? [];
    this._emit('layerchange', { layer: entry });
    this._emit('statechange');
  }

  /**
   * Clears the catalog cache and reloads the folder tree.
   */
  refreshCatalog(): void {
    if (!this._catalog || !this._panelView) return;
    this._catalog.clearCache();
    this._metadataCache.clear();
    this._allServices = [];
    this._prefetchStarted = false;

    const tree = createTreeView(this._treeContext());
    this._treeView = tree;
    if (!this._state.query) {
      this._panelView.browse.replaceChildren(tree.el);
      tree.load();
    }
  }

  /**
   * Registers an event handler.
   *
   * @param event - The event type to listen for
   * @param handler - The callback function
   */
  on(event: EnviroAtlasControlEvent, handler: EnviroAtlasControlEventHandler): void {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event)!.add(handler);
  }

  /**
   * Removes an event handler.
   *
   * @param event - The event type
   * @param handler - The callback function to remove
   */
  off(event: EnviroAtlasControlEvent, handler: EnviroAtlasControlEventHandler): void {
    this._eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Gets the map instance.
   *
   * @returns The MapLibre GL map instance or undefined if not added to a map
   */
  getMap(): MapLibreMap | undefined {
    return this._map;
  }

  /**
   * Gets the control container element.
   *
   * @returns The container element or undefined if not added to a map
   */
  getContainer(): HTMLElement | undefined {
    return this._container;
  }

  /**
   * Emits an event to all registered handlers.
   *
   * @param event - The event type to emit
   * @param extra - Extra payload (layer or error)
   */
  private _emit(event: EnviroAtlasControlEvent, extra?: { layer?: AddedLayer; error?: Error }): void {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      const eventData = { type: event, state: this.getState(), ...extra };
      handlers.forEach((handler) => handler(eventData));
    }
  }

  private _handleError(error: Error): void {
    if (error.name === 'AbortError') return;
    this._showNotice(error.message, true);
    this._emit('error', { error });
  }

  private _showNotice(message: string, isError = false): void {
    const notice = this._panelView?.notice;
    if (!notice) return;
    notice.textContent = message;
    notice.classList.toggle('enviroatlas-notice-error', isError);
    notice.hidden = false;
    if (this._noticeTimer) clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => {
      notice.hidden = true;
    }, 4000);
  }

  /**
   * Applies the current theme via a data-theme attribute on both the
   * control container and the floating panel. In 'auto' mode no
   * attribute is set, letting the prefers-color-scheme media query
   * drive the palette.
   */
  private _applyTheme(): void {
    for (const element of [this._container, this._panel]) {
      if (!element) continue;
      if (this._state.theme === 'auto') {
        element.removeAttribute('data-theme');
      } else {
        element.setAttribute('data-theme', this._state.theme);
      }
    }
  }

  private _treeContext() {
    return {
      catalog: this._catalog!,
      onAdd: (service: ServiceRef, sublayerId?: number, label?: string) =>
        this.addServiceLayer(service, sublayerId, label),
      onMetadata: (service: ServiceRef, metadata: ServiceMetadata) => {
        this._metadataCache.set(service.fullName, metadata);
      },
      onError: (error: Error) => this._handleError(error),
    };
  }

  /**
   * Handles (debounced) search input: shows the tree when the query
   * is empty, otherwise filters the catalog and renders flat results.
   *
   * @param query - The raw search query
   */
  private _runSearch(query: string): void {
    if (!this._panelView || !this._catalog || !this._resultsView || !this._treeView) return;
    this._state.query = query;
    const epoch = ++this._searchEpoch;

    if (!query.trim()) {
      this._panelView.browse.replaceChildren(this._treeView.el);
      this._emit('statechange');
      return;
    }

    this._panelView.browse.replaceChildren(this._resultsView.el);

    const renderResults = (note?: string) => {
      if (epoch !== this._searchEpoch || !this._resultsView) return;
      const results = filterCatalog(this._state.query, this._allServices, this._metadataCache);
      this._resultsView.setResults(results, note);
    };

    if (this._allServices.length === 0) {
      this._resultsView.setStatus('Loading catalog...');
    }

    this._catalog
      .listAllServices()
      .then((services) => {
        this._allServices = services;
        const prefetching = this._startPrefetch(() => renderResults(undefined));
        renderResults(prefetching ? 'Indexing sublayers...' : undefined);
      })
      .catch((error: Error) => this._handleError(error));

    this._emit('statechange');
  }

  /**
   * Starts the one-time sublayer metadata prefetch used for deep search.
   *
   * @param onUpdate - Called as metadata resolves and when done
   * @returns True when a prefetch is currently running
   */
  private _startPrefetch(onUpdate: () => void): boolean {
    if (!this._catalog) return false;
    if (this._prefetchStarted) {
      return this._metadataCache.size < this._allServices.filter((s) => s.type === 'MapServer').length;
    }
    this._prefetchStarted = true;

    const syncCache = () => {
      for (const service of this._allServices) {
        if (this._metadataCache.has(service.fullName)) continue;
        const cached = this._catalog?.getCachedMetadata(service);
        cached?.then((metadata) => this._metadataCache.set(service.fullName, metadata)).catch(() => undefined);
      }
    };

    const refresh = debounce(() => {
      syncCache();
      // Allow promises captured in syncCache to settle before rendering
      setTimeout(onUpdate, 0);
    }, 300);

    this._catalog
      .prefetchAllLayers(() => {
        syncCache();
        refresh();
      })
      .then(() => {
        syncCache();
        setTimeout(onUpdate, 0);
      })
      .catch((error: Error) => this._handleError(error));
    return true;
  }

  /**
   * Creates the main container element for the control.
   * Contains a toggle button (29x29) matching navigation control size.
   *
   * @returns The container element
   */
  private _createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = `maplibregl-ctrl maplibregl-ctrl-group enviroatlas-control${
      this._options.className ? ` ${this._options.className}` : ''
    }`;

    // Create toggle button (29x29 to match navigation control)
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'enviroatlas-toggle';
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-label', this._options.title);
    toggleBtn.title = this._options.title;
    toggleBtn.innerHTML = `
      <span class="enviroatlas-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3a9 9 0 1 0 9 9"/>
          <path d="M21 3c-5 0-9 4-9 9 5 0 9-4 9-9z"/>
          <path d="M12 12c0 3 1 6 3 9"/>
        </svg>
      </span>
    `;
    toggleBtn.addEventListener('click', () => this.toggle());

    container.appendChild(toggleBtn);

    return container;
  }

  /**
   * Creates the panel element with header, search, browse region,
   * and the added layers section.
   *
   * @returns The panel element
   */
  private _createPanel(): HTMLElement {
    const panelView = createPanelView({
      title: this._options.title,
      panelWidth: this._options.panelWidth,
      onClose: () => this.collapse(),
      onSearchInput: (query) => this._debouncedSearch?.(query),
    });
    this._panelView = panelView;

    this._treeView = createTreeView(this._treeContext());
    panelView.browse.appendChild(this._treeView.el);

    this._resultsView = createResultsView({
      onAdd: (service, sublayerId, label) => this.addServiceLayer(service, sublayerId, label),
    });

    this._addedView = createAddedLayersView({
      catalog: this._catalog!,
      onVisibilityChange: (id, visible) => this.setLayerVisibility(id, visible),
      onOpacityChange: (id, opacity) => this.setLayerOpacity(id, opacity),
      onRemove: (id) => this.removeLayer(id),
    });
    panelView.addedSlot.appendChild(this._addedView.el);

    return panelView.panel;
  }

  /**
   * Setup event listeners for panel positioning and click-outside behavior.
   */
  private _setupEventListeners(): void {
    // Click outside to close (check both container and panel since they're now separate).
    // The capture-phase listener snapshots the expanded state before any other
    // handler runs, so a handler that expands the panel during the same click
    // (e.g. an external "expand" button) does not get undone by the bubbling
    // outside-click handler.
    this._clickCaptureHandler = () => {
      this._expandedAtClickStart = !this._state.collapsed;
    };
    document.addEventListener('click', this._clickCaptureHandler, true);

    this._clickOutsideHandler = (e: MouseEvent) => {
      const target = e.target as Node;
      // A target detached mid-dispatch (e.g. a remove button whose row was
      // re-rendered by its own click handler) cannot be classified as
      // outside the panel; ignore it.
      if (!target.isConnected) return;
      if (
        this._expandedAtClickStart &&
        this._container &&
        this._panel &&
        !this._container.contains(target) &&
        !this._panel.contains(target)
      ) {
        this.collapse();
      }
    };
    document.addEventListener('click', this._clickOutsideHandler);

    // Update panel position on window resize
    this._resizeHandler = () => {
      if (!this._state.collapsed) {
        this._updatePanelPosition();
      }
    };
    window.addEventListener('resize', this._resizeHandler);

    // Update panel position on map resize (e.g., sidebar toggle)
    this._mapResizeHandler = () => {
      if (!this._state.collapsed) {
        this._updatePanelPosition();
      }
    };
    this._map?.on('resize', this._mapResizeHandler);

    // The EnviroAtlas server intermittently fails tile requests (504s
    // or responses without CORS headers); keep those out of the console
    // while preserving MapLibre's default logging for other errors.
    if (this._options.quietTileErrors) {
      this._mapErrorHandler = (e) => {
        const url = (e?.error as { url?: unknown } | undefined)?.url;
        if (typeof url === 'string' && url.startsWith(this._options.servicesUrl)) {
          this._emit('error', { error: e.error });
          return;
        }
        // Mimic MapLibre's default behavior for unrelated errors
        console.error(e?.error);
      };
      this._map?.on('error', this._mapErrorHandler);
    }
  }

  /**
   * Detect which corner the control is positioned in.
   *
   * @returns The position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
   */
  private _getControlPosition(): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' {
    const parent = this._container?.parentElement;
    if (!parent) return 'top-right'; // Default

    if (parent.classList.contains('maplibregl-ctrl-top-left')) return 'top-left';
    if (parent.classList.contains('maplibregl-ctrl-top-right')) return 'top-right';
    if (parent.classList.contains('maplibregl-ctrl-bottom-left')) return 'bottom-left';
    if (parent.classList.contains('maplibregl-ctrl-bottom-right')) return 'bottom-right';

    return 'top-right'; // Default
  }

  /**
   * Update the panel position based on button location and control corner.
   * Positions the panel next to the button, expanding in the appropriate
   * direction, and caps the panel height to the map container so the
   * content scrolls vertically on small screens.
   */
  private _updatePanelPosition(): void {
    if (!this._container || !this._panel || !this._mapContainer) return;

    // Get the toggle button (first child of container)
    const button = this._container.querySelector('.enviroatlas-toggle');
    if (!button) return;

    const buttonRect = button.getBoundingClientRect();
    const mapRect = this._mapContainer.getBoundingClientRect();
    const position = this._getControlPosition();

    // Calculate button position relative to map container
    const buttonTop = buttonRect.top - mapRect.top;
    const buttonBottom = mapRect.bottom - buttonRect.bottom;
    const buttonLeft = buttonRect.left - mapRect.left;
    const buttonRight = mapRect.right - buttonRect.right;

    const panelGap = 5; // Gap between button and panel
    const edgeMargin = 10; // Minimum distance from the map edge

    // Reset all positioning
    this._panel.style.top = '';
    this._panel.style.bottom = '';
    this._panel.style.left = '';
    this._panel.style.right = '';

    // Cap the panel height to the space between the button and the
    // opposite map edge so the content scrolls instead of overflowing.
    const offset = (position.startsWith('top') ? buttonTop : buttonBottom) + buttonRect.height + panelGap;
    const maxHeight = Math.max(120, mapRect.height - offset - edgeMargin);
    this._panel.style.setProperty('--ea-panel-max-h', `${Math.round(maxHeight)}px`);
    // Cap the panel width to the map width
    const maxWidth = Math.max(200, mapRect.width - 2 * edgeMargin);
    this._panel.style.setProperty('--ea-panel-max-w', `${Math.round(maxWidth)}px`);

    switch (position) {
      case 'top-left':
        // Panel expands down and to the right
        this._panel.style.top = `${buttonTop + buttonRect.height + panelGap}px`;
        this._panel.style.left = `${buttonLeft}px`;
        break;

      case 'top-right':
        // Panel expands down and to the left
        this._panel.style.top = `${buttonTop + buttonRect.height + panelGap}px`;
        this._panel.style.right = `${buttonRight}px`;
        break;

      case 'bottom-left':
        // Panel expands up and to the right
        this._panel.style.bottom = `${buttonBottom + buttonRect.height + panelGap}px`;
        this._panel.style.left = `${buttonLeft}px`;
        break;

      case 'bottom-right':
        // Panel expands up and to the left
        this._panel.style.bottom = `${buttonBottom + buttonRect.height + panelGap}px`;
        this._panel.style.right = `${buttonRight}px`;
        break;
    }
  }
}
