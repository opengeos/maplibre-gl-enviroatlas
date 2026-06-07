/**
 * Minimal DOM helpers shared by the panel views.
 */

/**
 * Creates an element with a class name and optional text content.
 *
 * @param tag - The HTML tag name
 * @param className - CSS class name(s)
 * @param text - Optional text content
 * @returns The created element
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * Creates a small icon button.
 *
 * @param className - CSS class name(s)
 * @param label - Accessible label
 * @param html - Inner HTML (e.g. an SVG icon)
 * @returns The created button
 */
export function iconButton(className: string, label: string, html: string): HTMLButtonElement {
  const button = el('button', className);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = html;
  return button;
}

/** Chevron icon used for expand/collapse carets */
export const CHEVRON_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>';

/** Plus icon used for add buttons */
export const PLUS_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
