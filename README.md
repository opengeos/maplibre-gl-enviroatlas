# MapLibre GL EnviroAtlas

A MapLibre GL JS plugin for searching and adding [EPA EnviroAtlas web services](https://www.epa.gov/enviroatlas/enviroatlas-web-services) to a map. It ships a standalone MapLibre control, a React wrapper, and a GeoLibre Desktop plugin bundle.

[![npm version](https://img.shields.io/npm/v/maplibre-gl-enviroatlas.svg)](https://www.npmjs.com/package/maplibre-gl-enviroatlas)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Catalog Browsing** - Browse EnviroAtlas folders, services, and sublayers in a collapsible tree
- **Deep Search** - Search both service names and individual sublayer names (e.g. "tree cover", "asthma")
- **Layer Management** - Visibility toggle, opacity slider, legend display, and removal for each added layer
- **MapServer and ImageServer** - Adds dynamic ArcGIS services as MapLibre raster layers, reprojected to Web Mercator on the fly
- **Auto Zoom** - Zooms the map to each added layer's extent (disable with `fitBoundsOnAdd: false`)
- **Extent-aware Tiles** - Tile requests are limited to each service's data extent, avoiding slow out-of-extent server errors
- **Dark and Light Mode** - Follows the OS preference by default, with explicit `light`/`dark`/`auto` themes
- **Small Screen Friendly** - The panel caps its size to the map and scrolls vertically
- **TypeScript Support** - Full TypeScript support with exported type definitions
- **React Integration** - React wrapper component and custom hook
- **GeoLibre Bundle Output** - Builds a zip with root `plugin.json`, bundled ESM, and CSS for GeoLibre Desktop

## Installation

```bash
npm install maplibre-gl-enviroatlas
```

## Quick Start

### Vanilla JavaScript / TypeScript

```typescript
import maplibregl from 'maplibre-gl';
import { EnviroAtlasControl } from 'maplibre-gl-enviroatlas';
import 'maplibre-gl-enviroatlas/style.css';
import 'maplibre-gl/dist/maplibre-gl.css';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/positron',
  center: [-96, 38.5],
  zoom: 4,
});

map.on('load', () => {
  const control = new EnviroAtlasControl({
    collapsed: true,
    theme: 'auto',
  });
  map.addControl(control, 'top-right');

  control.on('layeradd', (event) => {
    console.log('Added layer:', event.layer?.label);
  });
});
```

### React

```tsx
import { EnviroAtlasControlReact, useEnviroAtlas } from 'maplibre-gl-enviroatlas/react';
import 'maplibre-gl-enviroatlas/style.css';

function MyMap({ map }) {
  const { state, setState, toggle } = useEnviroAtlas({ collapsed: false });

  return (
    <>
      <button onClick={toggle}>{state.collapsed ? 'Expand' : 'Collapse'}</button>
      {map && (
        <EnviroAtlasControlReact
          map={map}
          collapsed={state.collapsed}
          theme="auto"
          onStateChange={setState}
          onLayerAdd={(layer) => console.log('Added', layer.label)}
        />
      )}
    </>
  );
}
```

## API

### `EnviroAtlasControl`

Implements MapLibre's `IControl`. The control renders as a 29x29 toggle button that expands into a floating panel.

#### Options (`EnviroAtlasControlOptions`)

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `collapsed` | `boolean` | `true` | Start with only the toggle button visible |
| `position` | `'top-left' \| 'top-right' \| 'bottom-left' \| 'bottom-right'` | `'top-right'` | Control position on the map |
| `title` | `string` | `'US EPA EnviroAtlas'` | Panel header title |
| `panelWidth` | `number` | `360` | Panel width in pixels (capped to the viewport) |
| `className` | `string` | `''` | Extra CSS class for the control container |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'auto'` | Color theme; `auto` follows `prefers-color-scheme` |
| `servicesUrl` | `string` | EnviroAtlas REST root | ArcGIS REST services directory to browse |
| `excludedFolders` | `string[]` | `['test_services', 'Utilities', 'monitor']` | Folders hidden from browsing and search |
| `defaultOpacity` | `number` | `1` | Initial opacity for added layers (0 to 1) |
| `tileSize` | `number` | `256` | Raster tile size in pixels |
| `imageFormat` | `string` | `'png32'` | ArcGIS export image format |
| `attribution` | `string` | `'U.S. EPA EnviroAtlas'` | Attribution for added raster sources |
| `searchDebounceMs` | `number` | `250` | Debounce delay for the search input |
| `fitBoundsOnAdd` | `boolean` | `true` | Zoom the map to a layer's extent when it is added |
| `quietTileErrors` | `boolean` | `true` | Keep transient EnviroAtlas tile failures out of the console (surfaced via the `error` event instead) |

#### Methods

| Method | Description |
| --- | --- |
| `addServiceLayer(service, sublayerId?, label?)` | Adds a service or single MapServer sublayer to the map (async; resolves with the added layer) |
| `removeLayer(id)` | Removes a layer added through the control |
| `setLayerOpacity(id, opacity)` | Sets the raster opacity of an added layer |
| `setLayerVisibility(id, visible)` | Shows or hides an added layer |
| `setTheme(theme)` | Switches the color theme |
| `refreshCatalog()` | Clears caches and reloads the catalog tree |
| `getState()` / `setState(partial)` | Reads or merges the control state |
| `toggle()` / `expand()` / `collapse()` | Controls the panel visibility |
| `on(event, handler)` / `off(event, handler)` | Event subscription |
| `getMap()` / `getContainer()` | Accessors for the map and container |

#### Events

`collapse`, `expand`, `statechange`, `layeradd`, `layerremove`, `layerchange`, `error`. Handlers receive `{ type, state, layer?, error? }`.

### `EnviroAtlasControlReact`

React wrapper with all control options as props, plus:

| Prop | Type | Description |
| --- | --- | --- |
| `map` | `maplibregl.Map` | The map instance (required) |
| `onStateChange` | `(state: EnviroAtlasState) => void` | Fired on every state change |
| `onLayerAdd` | `(layer: AddedLayer) => void` | Fired when a layer is added |
| `onLayerRemove` | `(layer: AddedLayer) => void` | Fired when a layer is removed |
| `onError` | `(error: Error) => void` | Fired on catalog or network errors |

### `useEnviroAtlas(initialState?)`

Hook returning `{ state, setState, setCollapsed, setPanelWidth, setTheme, setData, reset, toggle }`.

### Lower-level API

The catalog client and pure helpers are exported for advanced use:

```typescript
import {
  CatalogClient,
  filterCatalog,
  buildExportUrl,
  buildExportImageUrl,
  buildTileTemplate,
  buildLegendUrl,
} from 'maplibre-gl-enviroatlas';
```

`buildTileTemplate(service, sublayerId?)` returns a tile URL template (containing `{bbox-epsg-3857}`) suitable for a MapLibre raster source, using the ArcGIS dynamic `export` / `exportImage` endpoints with on-the-fly reprojection to EPSG:3857.

## Theming

The stylesheet is driven by CSS custom properties (`--ea-bg`, `--ea-fg`, `--ea-accent`, ...). With `theme: 'auto'` the palette follows `prefers-color-scheme`; `theme: 'light'` or `theme: 'dark'` forces a palette via a `data-theme` attribute. You can override any variable in your own CSS:

```css
.enviroatlas-control,
.enviroatlas-panel {
  --ea-accent: #2e7d32;
}
```

## Examples

Run the dev server and open the examples:

```bash
npm install
npm run dev
```

- `examples/basic` - vanilla TypeScript
- `examples/react` - React wrapper and hook

## Build a GeoLibre plugin zip

GeoLibre Desktop loads external plugins from an app data `plugins/` directory. The zip must contain `plugin.json` at the root, plus a bundled ESM entry and optional CSS file.

```bash
npm install
npm run package:geolibre
```

This creates `geolibre-plugin/maplibre-gl-enviroatlas-0.1.0.zip` containing:

```text
plugin.json
dist/index.js
dist/style.css
```

Copy the zip into GeoLibre Desktop's app data `plugins/` directory and restart GeoLibre. For the GeoLibre web app, serve the unpacked plugin with CORS enabled:

```bash
npm run serve:geolibre
```

## Development

```bash
npm install        # install dependencies
npm run dev        # dev server with the examples
npm test           # run tests
npm run lint       # lint
npm run build      # build the library and the GeoLibre bundle
npm run build:examples  # build the examples site
```

## Docker

```bash
docker build -t maplibre-gl-enviroatlas .
docker run -p 8080:80 maplibre-gl-enviroatlas
# open http://localhost:8080/maplibre-gl-enviroatlas/
```

## Project Structure

```text
src/
├── index.ts                 # Main entry (control + API + types)
├── react.ts                 # React entry (wrapper + hook)
├── geolibre.ts              # GeoLibre Desktop plugin wrapper
└── lib/
    ├── api/                 # Catalog client, URL builders, search
    ├── core/                # EnviroAtlasControl, map layer manager, types
    ├── ui/                  # Panel, tree, results, added layers, legend views
    ├── hooks/               # useEnviroAtlas
    ├── styles/              # Themed stylesheet
    └── utils/               # Generic helpers
```

## Data Source

This plugin reads the public EnviroAtlas ArcGIS REST services directory at `https://enviroatlas.epa.gov/arcgis/rest/services`. EnviroAtlas data are produced by the U.S. Environmental Protection Agency. See the [EnviroAtlas web services page](https://www.epa.gov/enviroatlas/enviroatlas-web-services) for documentation and terms.

## License

MIT
