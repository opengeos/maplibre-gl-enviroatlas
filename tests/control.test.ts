import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnviroAtlasControl } from '../src/lib/core/EnviroAtlasControl';
import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Minimal fake MapLibre map sufficient for mounting the control.
 */
function createFakeMap(): { map: MapLibreMap; mapContainer: HTMLElement; controlCorner: HTMLElement } {
  const mapContainer = document.createElement('div');
  const controlCorner = document.createElement('div');
  controlCorner.className = 'maplibregl-ctrl-top-right';
  mapContainer.appendChild(controlCorner);
  document.body.appendChild(mapContainer);

  const map = {
    getContainer: () => mapContainer,
    on: vi.fn(),
    off: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    getLayer: vi.fn(),
    getSource: vi.fn(),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    fitBounds: vi.fn(),
    getBounds: () => ({
      getWest: () => -130,
      getSouth: () => 20,
      getEast: () => -60,
      getNorth: () => 55,
    }),
    getStyle: () => ({ layers: [{ id: 'water' }, { id: 'labels' }] }),
    moveLayer: vi.fn(),
  } as unknown as MapLibreMap;

  return { map, mapContainer, controlCorner };
}

const SERVICE_METADATA = {
  mapName: 'Map',
  layers: [{ id: 0, name: 'PADUS 2.0', parentLayerId: -1, subLayerIds: null }],
  fullExtent: {
    xmin: -11816077.7136,
    ymin: -262699.1307,
    xmax: 3420079.9032,
    ymax: 7786809.3745,
    spatialReference: { wkid: 102039 },
  },
};

describe('EnviroAtlasControl', () => {
  const fetchMock = vi.fn((url: string) => {
    if (typeof url === 'string' && /\/(MapServer|ImageServer)\?f=json/.test(url)) {
      return Promise.resolve(
        new Response(JSON.stringify(SERVICE_METADATA), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
    return new Promise<Response>(() => undefined); // catalog requests stay pending
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  function mount(options?: ConstructorParameters<typeof EnviroAtlasControl>[0]) {
    const { map, mapContainer, controlCorner } = createFakeMap();
    const control = new EnviroAtlasControl(options);
    const container = control.onAdd(map);
    controlCorner.appendChild(container);
    const panel = mapContainer.querySelector('.enviroatlas-panel') as HTMLElement;
    return { control, container, panel, mapContainer };
  }

  it('mounts collapsed by default with a toggle button', () => {
    const { control, container, panel } = mount();
    expect(container.querySelector('.enviroatlas-toggle')).toBeTruthy();
    expect(panel.classList.contains('expanded')).toBe(false);
    expect(control.getState().collapsed).toBe(true);
    control.onRemove();
  });

  it('collapses on an outside click while expanded', () => {
    const { control, panel } = mount({ collapsed: false });
    expect(panel.classList.contains('expanded')).toBe(true);

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(control.getState().collapsed).toBe(true);
    expect(panel.classList.contains('expanded')).toBe(false);
    control.onRemove();
  });

  it('does not collapse on clicks inside the panel', () => {
    const { control, panel } = mount({ collapsed: false });
    const input = panel.querySelector('.enviroatlas-search-input') as HTMLElement;
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(control.getState().collapsed).toBe(false);
    control.onRemove();
  });

  it('stays expanded when an external trigger expands it during the same click', () => {
    // Reproduces an external "Expand" button (e.g. React wrapper) whose
    // click handler expands the control mid-dispatch. The bubbling
    // click-outside handler must not collapse it again.
    const { control, panel } = mount({ collapsed: true });

    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.addEventListener('click', () => control.expand());
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(control.getState().collapsed).toBe(false);
    expect(panel.classList.contains('expanded')).toBe(true);
    control.onRemove();
  });

  it('keeps the panel open when removing a layer re-renders the row mid-click', async () => {
    const { control, panel } = mount({ collapsed: false });
    const layer = await control.addServiceLayer(
      { folder: 'Supplemental', name: 'PADUS', fullName: 'Supplemental/PADUS', type: 'MapServer' },
      0,
      'PADUS 2.0'
    );
    expect(layer).toBeDefined();
    expect(control.getState().addedLayers).toHaveLength(1);

    // Clicking remove detaches the button from the DOM before the click
    // bubbles to the document; the click-outside handler must not treat
    // the detached target as an outside click.
    const removeBtn = panel.querySelector('.enviroatlas-remove-btn') as HTMLButtonElement;
    removeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(control.getState().addedLayers).toHaveLength(0);
    expect(control.getState().collapsed).toBe(false);
    expect(panel.classList.contains('expanded')).toBe(true);
    control.onRemove();
  });

  it('adds layers as a single view-sized export image and zooms to them', async () => {
    const { control } = mount({ collapsed: false });
    const map = control.getMap()!;
    const layer = await control.addServiceLayer(
      { folder: 'Supplemental', name: 'PADUS', fullName: 'Supplemental/PADUS', type: 'MapServer' },
      0,
      'PADUS 2.0'
    );

    expect(layer?.bounds).toBeDefined();
    const sourceSpec = (map.addSource as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(sourceSpec.type).toBe('image');
    expect(sourceSpec.url).toContain('/MapServer/export?bbox=');
    expect(sourceSpec.url).toContain('layers=show:0');
    expect(sourceSpec.url).not.toContain('{bbox-epsg-3857}');
    expect(map.fitBounds).toHaveBeenCalledWith(layer?.bounds, { padding: 40 });
    // A shared view listener keeps the image in sync with the map
    const moveendCall = (map.on as ReturnType<typeof vi.fn>).mock.calls.find(([type]) => type === 'moveend');
    expect(moveendCall).toBeDefined();
    control.onRemove();
  });

  it('inserts added layers before the configured beforeId when it exists', async () => {
    const { control } = mount({ collapsed: false, beforeId: 'labels' });
    const map = control.getMap()!;
    (map.getLayer as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
      id === 'labels' ? { id: 'labels' } : undefined
    );

    await control.addServiceLayer(
      { folder: 'Supplemental', name: 'PADUS', fullName: 'Supplemental/PADUS', type: 'MapServer' },
      0,
      'PADUS 2.0'
    );

    const addLayerCall = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(addLayerCall[1]).toBe('labels');
    control.onRemove();
  });

  it('ignores beforeId when the layer does not exist on the map', async () => {
    const { control } = mount({ collapsed: false, beforeId: 'missing-layer' });
    const map = control.getMap()!;

    await control.addServiceLayer(
      { folder: 'Supplemental', name: 'PADUS', fullName: 'Supplemental/PADUS', type: 'MapServer' },
      0,
      'PADUS 2.0'
    );

    const addLayerCall = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(addLayerCall[1]).toBeUndefined();
    control.onRemove();
  });

  it('adds tiled raster sources with extent bounds in tiles mode', async () => {
    const { control } = mount({ collapsed: false, renderMode: 'tiles' });
    const map = control.getMap()!;
    const layer = await control.addServiceLayer(
      { folder: 'Supplemental', name: 'PADUS', fullName: 'Supplemental/PADUS', type: 'MapServer' },
      0,
      'PADUS 2.0'
    );

    const sourceSpec = (map.addSource as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(sourceSpec.type).toBe('raster');
    expect(sourceSpec.tiles[0]).toContain('{bbox-epsg-3857}');
    expect(sourceSpec.bounds).toEqual(layer?.bounds);
    control.onRemove();
  });

  it('does not zoom when fitBoundsOnAdd is false', async () => {
    const { control } = mount({ collapsed: false, fitBoundsOnAdd: false });
    const map = control.getMap()!;
    await control.addServiceLayer(
      { folder: 'Supplemental', name: 'PADUS', fullName: 'Supplemental/PADUS', type: 'MapServer' },
      0,
      'PADUS 2.0'
    );

    expect(map.fitBounds).not.toHaveBeenCalled();
    control.onRemove();
  });

  it('quiets EnviroAtlas tile errors but logs unrelated map errors', () => {
    const { control } = mount();
    const map = control.getMap()!;
    const errorCall = (map.on as ReturnType<typeof vi.fn>).mock.calls.find(([type]) => type === 'error');
    expect(errorCall).toBeDefined();
    const handler = errorCall![1] as (e: { error?: Error }) => void;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const errorEvents: Error[] = [];
    control.on('error', (event) => {
      if (event.error) errorEvents.push(event.error);
    });

    // EnviroAtlas tile failure: quiet, surfaced via the control event
    const tileError = Object.assign(new Error('Failed to fetch'), {
      url: 'https://enviroatlas.epa.gov/arcgis/rest/services/Supplemental/PADUS/MapServer/export?bbox=1,2,3,4',
    });
    handler({ error: tileError });
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(errorEvents).toHaveLength(1);

    // Unrelated map error: logged like MapLibre's default
    const otherError = new Error('style error');
    handler({ error: otherError });
    expect(consoleSpy).toHaveBeenCalledWith(otherError);

    consoleSpy.mockRestore();
    control.onRemove();
  });

  it('does not subscribe to map errors when quietTileErrors is false', () => {
    const { control } = mount({ quietTileErrors: false });
    const map = control.getMap()!;
    const errorCall = (map.on as ReturnType<typeof vi.fn>).mock.calls.find(([type]) => type === 'error');
    expect(errorCall).toBeUndefined();
    control.onRemove();
  });

  it('resizes the panel by dragging the handle in both anchor directions', () => {
    const { control, panel } = mount({ collapsed: false, panelWidth: 360 });
    const resizer = panel.querySelector('.enviroatlas-resizer') as HTMLElement;
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ width: 360 } as DOMRect);

    // Left-anchored panel (default): dragging right grows the panel
    resizer.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 360 }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 460 }));
    document.dispatchEvent(new MouseEvent('pointerup', {}));
    expect(control.getState().panelWidth).toBe(460);
    expect(panel.style.getPropertyValue('--ea-panel-width')).toBe('460px');

    // Right-anchored panel: dragging left grows the panel
    panel.classList.add('enviroatlas-resize-left');
    resizer.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100 }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 40 }));
    document.dispatchEvent(new MouseEvent('pointerup', {}));
    expect(control.getState().panelWidth).toBe(420);
    control.onRemove();
  });

  it('clamps setPanelWidth to the minimum width', () => {
    const { control } = mount({ collapsed: false });
    control.setPanelWidth(50);
    expect(control.getState().panelWidth).toBe(240);
    control.onRemove();
  });

  it('populates the Insert before select and applies the choice', async () => {
    const { control, panel } = mount({ collapsed: false });
    const map = control.getMap()!;
    const select = panel.querySelector('.enviroatlas-before-select') as HTMLSelectElement;

    const values = [...select.options].map((o) => o.value);
    expect(values).toEqual(['', 'water', 'labels']);

    (map.getLayer as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
      id === 'labels' ? { id: 'labels' } : undefined
    );
    select.value = 'labels';
    select.dispatchEvent(new Event('change'));

    await control.addServiceLayer(
      { folder: 'Supplemental', name: 'PADUS', fullName: 'Supplemental/PADUS', type: 'MapServer' },
      0,
      'PADUS 2.0'
    );
    const addLayerCall = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(addLayerCall[1]).toBe('labels');
    control.onRemove();
  });

  it('moves existing layers when the Insert before choice changes', async () => {
    const { control, panel } = mount({ collapsed: false });
    const map = control.getMap()!;
    const layer = await control.addServiceLayer(
      { folder: 'Supplemental', name: 'PADUS', fullName: 'Supplemental/PADUS', type: 'MapServer' },
      0,
      'PADUS 2.0'
    );

    (map.getLayer as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
      id === 'labels' || id === layer!.layerId ? { id } : undefined
    );
    const select = panel.querySelector('.enviroatlas-before-select') as HTMLSelectElement;
    select.value = 'labels';
    select.dispatchEvent(new Event('change'));

    expect(map.moveLayer).toHaveBeenCalledWith(layer!.layerId, 'labels');
    control.onRemove();
  });

  it('collapses when the close (X) button is clicked', () => {
    const { control, panel } = mount({ collapsed: false });
    const closeBtn = panel.querySelector('.enviroatlas-close') as HTMLButtonElement;
    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(control.getState().collapsed).toBe(true);
    expect(panel.classList.contains('expanded')).toBe(false);
    control.onRemove();
  });

  it('applies an explicit theme to both the container and the panel', () => {
    const { control, container, panel } = mount({ theme: 'dark' });
    expect(container.getAttribute('data-theme')).toBe('dark');
    expect(panel.getAttribute('data-theme')).toBe('dark');

    control.setTheme('light');
    expect(container.getAttribute('data-theme')).toBe('light');
    expect(panel.getAttribute('data-theme')).toBe('light');

    control.setTheme('auto');
    expect(container.hasAttribute('data-theme')).toBe(false);
    expect(panel.hasAttribute('data-theme')).toBe(false);
    control.onRemove();
  });

  it('cleans up the panel on removal', () => {
    const { control, mapContainer } = mount({ collapsed: false });
    control.onRemove();
    expect(mapContainer.querySelector('.enviroatlas-panel')).toBeNull();
  });

  const RESTORE_ENTRY = {
    id: 'enviroatlas-restored',
    sourceId: 'enviroatlas-restored',
    layerId: 'enviroatlas-restored',
    service: { folder: 'Supplemental', name: 'PADUS', fullName: 'Supplemental/PADUS', type: 'MapServer' as const },
    sublayerId: 0,
    label: 'PADUS 2.0',
    visible: false,
    opacity: 0.5,
    bounds: [-130, 20, -60, 55] as [number, number, number, number],
  };

  it('reuses existing native source/layer when restoring and reconciles opacity/visibility', () => {
    const { control } = mount({ collapsed: false });
    const map = control.getMap()!;
    // Host already recreated the natives before activating the control.
    (map.getSource as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
      id === RESTORE_ENTRY.sourceId ? { type: 'image' } : undefined
    );
    (map.getLayer as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
      id === RESTORE_ENTRY.layerId ? { id } : undefined
    );

    control.restoreLayers([{ ...RESTORE_ENTRY }]);

    // No duplicate natives created
    expect(map.addSource).not.toHaveBeenCalled();
    expect(map.addLayer).not.toHaveBeenCalled();
    // Opacity and visibility applied to the existing native layer
    expect(map.setPaintProperty).toHaveBeenCalledWith(RESTORE_ENTRY.layerId, 'raster-opacity', 0.5);
    expect(map.setLayoutProperty).toHaveBeenCalledWith(RESTORE_ENTRY.layerId, 'visibility', 'none');

    const layers = control.getState().addedLayers;
    expect(layers).toHaveLength(1);
    expect(layers[0].id).toBe(RESTORE_ENTRY.id);
    expect(layers[0].opacity).toBe(0.5);
    expect(layers[0].visible).toBe(false);
    control.onRemove();
  });

  it('creates native source/layer when missing on restore (tiles mode)', () => {
    const { control } = mount({ collapsed: false, renderMode: 'tiles' });
    const map = control.getMap()!;
    // Natives do not exist yet (default getSource/getLayer return undefined).

    control.restoreLayers([{ ...RESTORE_ENTRY }]);

    const sourceSpec = (map.addSource as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(sourceSpec.type).toBe('raster');
    expect(sourceSpec.tiles[0]).toContain('{bbox-epsg-3857}');
    expect(sourceSpec.bounds).toEqual(RESTORE_ENTRY.bounds);

    const addLayerSpec = (map.addLayer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(addLayerSpec.id).toBe(RESTORE_ENTRY.layerId);
    expect(addLayerSpec.paint['raster-opacity']).toBe(0.5);
    expect(addLayerSpec.layout.visibility).toBe('none');
    control.onRemove();
  });

  it('restoreLayers skips duplicates and emits layeradd + statechange', () => {
    const { control } = mount({ collapsed: false });
    const map = control.getMap()!;
    (map.getSource as ReturnType<typeof vi.fn>).mockReturnValue({ type: 'image' });
    (map.getLayer as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
      id === RESTORE_ENTRY.layerId ? { id } : undefined
    );

    const added: unknown[] = [];
    let stateChanges = 0;
    control.on('layeradd', (e) => added.push(e.layer));
    control.on('statechange', () => stateChanges++);

    // Same entry twice: the second is a duplicate by service+sublayer.
    control.restoreLayers([{ ...RESTORE_ENTRY }, { ...RESTORE_ENTRY, id: 'enviroatlas-other' }]);

    expect(added).toHaveLength(1);
    // A single statechange for the whole batch
    expect(stateChanges).toBe(1);
    expect(control.getState().addedLayers).toHaveLength(1);
    control.onRemove();
  });

  it('does not emit when restoreLayers restores nothing', () => {
    const { control } = mount({ collapsed: false });
    let stateChanges = 0;
    control.on('statechange', () => stateChanges++);
    control.restoreLayers([]);
    expect(stateChanges).toBe(0);
    control.onRemove();
  });

  it('defers restoreLayers called before onAdd and applies it after the control is added', () => {
    const { map, controlCorner } = createFakeMap();
    (map.getSource as ReturnType<typeof vi.fn>).mockReturnValue({ type: 'image' });
    (map.getLayer as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
      id === RESTORE_ENTRY.layerId ? { id } : undefined
    );

    const control = new EnviroAtlasControl({ collapsed: false });
    // Called before the control is on a map: should defer, not throw.
    control.restoreLayers([{ ...RESTORE_ENTRY }]);
    expect(control.getState().addedLayers).toHaveLength(0);

    const container = control.onAdd(map);
    controlCorner.appendChild(container);

    expect(control.getState().addedLayers).toHaveLength(1);
    expect(control.getState().addedLayers[0].id).toBe(RESTORE_ENTRY.id);
    control.onRemove();
  });
});
