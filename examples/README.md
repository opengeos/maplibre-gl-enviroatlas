# Examples

This directory contains example implementations of MapLibre GL EnviroAtlas.

## Available Examples

### Basic Example
A vanilla TypeScript example showing how to add the EnviroAtlas control to a map, browse the catalog, search, and manage added layers.

```bash
# Run from project root
npm run dev
# Then navigate to http://localhost:5173/examples/basic/
```

### React Example
A React example demonstrating the React wrapper component, the `useEnviroAtlas` hook, and theme switching.

```bash
# Run from project root
npm run dev
# Then navigate to http://localhost:5173/examples/react/
```

## Running Examples

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to the example you want to view.

## Building Examples

To build all examples for deployment:

```bash
npm run build:examples
```

The built examples will be in the `dist-examples` directory.
