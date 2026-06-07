import { useEffect, useRef } from "react";
import { EnviroAtlasControl } from "./EnviroAtlasControl";
import type { EnviroAtlasControlReactProps } from "./types";

/**
 * React wrapper component for EnviroAtlasControl.
 *
 * This component manages the lifecycle of an EnviroAtlasControl
 * instance, adding it to the map on mount and removing it on unmount.
 *
 * @example
 * ```tsx
 * import { EnviroAtlasControlReact } from 'maplibre-gl-enviroatlas/react';
 *
 * function MyMap() {
 *   const [map, setMap] = useState<Map | null>(null);
 *
 *   return (
 *     <>
 *       <div ref={mapContainer} />
 *       {map && (
 *         <EnviroAtlasControlReact
 *           map={map}
 *           collapsed={false}
 *           theme="auto"
 *           onLayerAdd={(layer) => console.log('Added', layer.label)}
 *         />
 *       )}
 *     </>
 *   );
 * }
 * ```
 *
 * @param props - Component props including map instance and control options
 * @returns null - This component renders nothing directly
 */
export function EnviroAtlasControlReact({
  map,
  onStateChange,
  onLayerAdd,
  onLayerRemove,
  onError,
  ...options
}: EnviroAtlasControlReactProps): null {
  const controlRef = useRef<EnviroAtlasControl | null>(null);

  // Keep latest callbacks without re-creating the control
  const callbacksRef = useRef({ onStateChange, onLayerAdd, onLayerRemove, onError });
  callbacksRef.current = { onStateChange, onLayerAdd, onLayerRemove, onError };

  useEffect(() => {
    if (!map) return;

    // Create the control instance
    const control = new EnviroAtlasControl(options);
    controlRef.current = control;

    control.on("statechange", (event) => {
      callbacksRef.current.onStateChange?.(event.state);
    });
    control.on("layeradd", (event) => {
      if (event.layer) callbacksRef.current.onLayerAdd?.(event.layer);
    });
    control.on("layerremove", (event) => {
      if (event.layer) callbacksRef.current.onLayerRemove?.(event.layer);
    });
    control.on("error", (event) => {
      if (event.error) callbacksRef.current.onError?.(event.error);
    });

    // Add control to map
    map.addControl(control, options.position || "top-right");

    // Cleanup on unmount
    return () => {
      if (map.hasControl(control)) {
        map.removeControl(control);
      }
      controlRef.current = null;
    };
  }, [map]);

  // Update collapsed state when the prop changes
  useEffect(() => {
    if (controlRef.current && options.collapsed !== undefined) {
      const currentState = controlRef.current.getState();
      if (options.collapsed !== currentState.collapsed) {
        if (options.collapsed) {
          controlRef.current.collapse();
        } else {
          controlRef.current.expand();
        }
      }
    }
  }, [options.collapsed]);

  // Update theme when the prop changes
  useEffect(() => {
    if (controlRef.current && options.theme !== undefined) {
      if (controlRef.current.getState().theme !== options.theme) {
        controlRef.current.setTheme(options.theme);
      }
    }
  }, [options.theme]);

  // Update panel width when the prop changes
  useEffect(() => {
    if (controlRef.current && options.panelWidth !== undefined) {
      if (controlRef.current.getState().panelWidth !== options.panelWidth) {
        controlRef.current.setPanelWidth(options.panelWidth);
      }
    }
  }, [options.panelWidth]);

  return null;
}
