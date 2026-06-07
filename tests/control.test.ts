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

  it('adds layers with extent bounds and zooms to them', async () => {
    const { control } = mount({ collapsed: false });
    const map = control.getMap()!;
    const layer = await control.addServiceLayer(
      { folder: 'Supplemental', name: 'PADUS', fullName: 'Supplemental/PADUS', type: 'MapServer' },
      0,
      'PADUS 2.0'
    );

    expect(layer?.bounds).toBeDefined();
    const sourceSpec = (map.addSource as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(sourceSpec.bounds).toEqual(layer?.bounds);
    expect(map.fitBounds).toHaveBeenCalledWith(layer?.bounds, { padding: 40 });
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
});
