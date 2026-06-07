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
  } as unknown as MapLibreMap;

  return { map, mapContainer, controlCorner };
}

describe('EnviroAtlasControl', () => {
  const fetchMock = vi.fn(() => new Promise<Response>(() => undefined)); // never resolves

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
