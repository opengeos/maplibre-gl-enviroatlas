import { useState, useCallback } from 'react';
import type { EnviroAtlasState, EnviroAtlasTheme } from '../core/types';

/**
 * Default initial state for the EnviroAtlas control
 */
const DEFAULT_STATE: EnviroAtlasState = {
  collapsed: true,
  panelWidth: 360,
  theme: 'auto',
  query: '',
  addedLayers: [],
  data: {},
};

/**
 * Custom hook for tracking EnviroAtlas control state in React apps.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { state, setState, toggle } = useEnviroAtlas({ collapsed: false });
 *
 *   return (
 *     <div>
 *       <button onClick={toggle}>
 *         {state.collapsed ? 'Expand' : 'Collapse'}
 *       </button>
 *       <EnviroAtlasControlReact
 *         map={map}
 *         collapsed={state.collapsed}
 *         onStateChange={setState}
 *       />
 *     </div>
 *   );
 * }
 * ```
 *
 * @param initialState - Optional initial state values
 * @returns Object containing state and update functions
 */
export function useEnviroAtlas(initialState?: Partial<EnviroAtlasState>) {
  const [state, setState] = useState<EnviroAtlasState>({
    ...DEFAULT_STATE,
    ...initialState,
  });

  /**
   * Sets the collapsed state
   */
  const setCollapsed = useCallback((collapsed: boolean) => {
    setState((prev) => ({ ...prev, collapsed }));
  }, []);

  /**
   * Sets the panel width
   */
  const setPanelWidth = useCallback((panelWidth: number) => {
    setState((prev) => ({ ...prev, panelWidth }));
  }, []);

  /**
   * Sets the color theme
   */
  const setTheme = useCallback((theme: EnviroAtlasTheme) => {
    setState((prev) => ({ ...prev, theme }));
  }, []);

  /**
   * Sets custom data in the state
   */
  const setData = useCallback((data: Record<string, unknown>) => {
    setState((prev) => ({ ...prev, data: { ...prev.data, ...data } }));
  }, []);

  /**
   * Resets the state to default values
   */
  const reset = useCallback(() => {
    setState({ ...DEFAULT_STATE, ...initialState });
  }, [initialState]);

  /**
   * Toggles the collapsed state
   */
  const toggle = useCallback(() => {
    setState((prev) => ({ ...prev, collapsed: !prev.collapsed }));
  }, []);

  return {
    state,
    setState,
    setCollapsed,
    setPanelWidth,
    setTheme,
    setData,
    reset,
    toggle,
  };
}
