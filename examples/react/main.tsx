import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl, { Map } from 'maplibre-gl';
import { EnviroAtlasControlReact, useEnviroAtlas } from '../../src/react';
import type { AddedLayer, EnviroAtlasTheme } from '../../src/react';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * Main App component demonstrating the React integration
 */
function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<Map | null>(null);
  const [theme, setTheme] = useState<EnviroAtlasTheme>('auto');
  const [layerCount, setLayerCount] = useState(0);
  const { state, setState, toggle } = useEnviroAtlas({ collapsed: false });

  // Initialize the map
  useEffect(() => {
    if (!mapContainer.current) return;

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-96, 38.5],
      zoom: 3.5,
    });

    // Add navigation controls to top-right
    mapInstance.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Add fullscreen control to top-right (after navigation)
    mapInstance.addControl(new maplibregl.FullscreenControl(), 'top-right');

    mapInstance.on('load', () => {
      setMap(mapInstance);
    });

    return () => {
      mapInstance.remove();
    };
  }, []);

  const handleLayerAdd = (layer: AddedLayer) => {
    console.log('Layer added:', layer.label);
    setLayerCount((count) => count + 1);
  };

  const handleLayerRemove = (layer: AddedLayer) => {
    console.log('Layer removed:', layer.label);
    setLayerCount((count) => Math.max(0, count - 1));
  };

  const buttonStyle: React.CSSProperties = {
    padding: '8px 12px',
    background: '#4a90d9',
    color: 'white',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 500,
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* External controls using the hook */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1, display: 'flex', gap: 8 }}>
        <button onClick={toggle} style={buttonStyle}>
          {state.collapsed ? 'Expand' : 'Collapse'} Panel
        </button>
        <button
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : t === 'light' ? 'auto' : 'dark'))}
          style={buttonStyle}
        >
          Theme: {theme}
        </button>
        <span
          style={{
            ...buttonStyle,
            background: 'rgba(0, 0, 0, 0.6)',
            cursor: 'default',
          }}
        >
          {layerCount} layer{layerCount === 1 ? '' : 's'} added
        </span>
      </div>

      {/* EnviroAtlas control */}
      {map && (
        <EnviroAtlasControlReact
          map={map}
          collapsed={state.collapsed}
          panelWidth={360}
          theme={theme}
          onStateChange={setState}
          onLayerAdd={handleLayerAdd}
          onLayerRemove={handleLayerRemove}
          onError={(error) => console.warn('EnviroAtlas error:', error.message)}
        />
      )}
    </div>
  );
}

// Mount the app
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
