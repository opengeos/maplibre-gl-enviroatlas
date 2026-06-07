import maplibregl from 'maplibre-gl';
import { EnviroAtlasControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// Create map centered on the contiguous United States
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [-96, 38.5],
  zoom: 3.5,
});

// Add navigation controls to top-right
map.addControl(new maplibregl.NavigationControl(), 'top-right');

// Add fullscreen control to top-right (after navigation)
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

// Add the EnviroAtlas control when the map loads
map.on('load', () => {
  // Set collapsed: true to start with just the 29x29 button (like navigation control)
  const enviroAtlas = new EnviroAtlasControl({
    collapsed: false,
    panelWidth: 360,
    theme: 'auto', // follows the OS light/dark preference
  });

  // Add control to the map
  map.addControl(enviroAtlas, 'top-right');

  // Listen for layer events
  enviroAtlas.on('layeradd', (event) => {
    console.log('Layer added:', event.layer?.label);
  });

  enviroAtlas.on('layerremove', (event) => {
    console.log('Layer removed:', event.layer?.label);
  });

  enviroAtlas.on('error', (event) => {
    console.warn('EnviroAtlas error:', event.error?.message);
  });

  console.log('EnviroAtlas control added to map');
});
