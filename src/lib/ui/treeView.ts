/**
 * Folder > service > sublayer tree view for browsing the catalog.
 *
 * Folders and service layer lists are fetched lazily on expand and
 * cached by the catalog client.
 */
import type { CatalogClient } from '../api/catalog';
import type { ServiceLayer, ServiceMetadata, ServiceRef } from '../api/types';
import { el, iconButton, CHEVRON_SVG, PLUS_SVG } from './dom';

/**
 * Callbacks and dependencies for the tree view.
 */
export interface TreeViewContext {
  /** Catalog client used to fetch folders, services, and layers */
  catalog: CatalogClient;
  /** Called when the user adds a service or sublayer */
  onAdd: (service: ServiceRef, sublayerId?: number, label?: string) => void;
  /** Called when service metadata resolves (feeds the search cache) */
  onMetadata: (service: ServiceRef, metadata: ServiceMetadata) => void;
  /** Called when a fetch fails */
  onError: (error: Error) => void;
}

/**
 * The tree view instance.
 */
export interface TreeView {
  /** Root element to insert into the panel */
  el: HTMLElement;
  /** Loads the folder list if not yet loaded */
  load: () => void;
}

function addButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = iconButton('enviroatlas-add-btn', `Add ${label} to map`, PLUS_SVG);
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return button;
}

function statusRow(text: string, kind: 'loading' | 'error' | 'empty' = 'loading'): HTMLElement {
  return el('div', `enviroatlas-status enviroatlas-status-${kind}`, text);
}

/**
 * Creates the browse tree view.
 *
 * @param ctx - Dependencies and callbacks
 * @returns The tree view instance
 */
export function createTreeView(ctx: TreeViewContext): TreeView {
  const root = el('div', 'enviroatlas-tree');
  let loaded = false;

  function renderSublayers(service: ServiceRef, layers: ServiceLayer[], parentId: number): HTMLElement {
    const list = el('div', 'enviroatlas-sublayers');
    for (const layer of layers.filter((l) => l.parentLayerId === parentId)) {
      const row = el('div', 'enviroatlas-row enviroatlas-sublayer-row');
      const isGroup = !!layer.subLayerIds?.length;

      if (isGroup) {
        const caret = iconButton('enviroatlas-caret', `Expand ${layer.name}`, CHEVRON_SVG);
        const name = el('span', 'enviroatlas-row-name', layer.name);
        name.title = layer.name;
        row.append(caret, name, addButton(layer.name, () => ctx.onAdd(service, layer.id, layer.name)));

        const children = renderSublayers(service, layers, layer.id);
        children.hidden = true;
        const toggleGroup = () => {
          children.hidden = !children.hidden;
          caret.classList.toggle('expanded', !children.hidden);
        };
        caret.addEventListener('click', toggleGroup);
        name.addEventListener('click', toggleGroup);
        list.append(row, children);
      } else {
        const name = el('span', 'enviroatlas-row-name enviroatlas-leaf', layer.name);
        name.title = layer.name;
        row.append(name, addButton(layer.name, () => ctx.onAdd(service, layer.id, layer.name)));
        list.append(row);
      }
    }
    return list;
  }

  function renderService(service: ServiceRef): HTMLElement {
    const wrapper = el('div', 'enviroatlas-service');
    const row = el('div', 'enviroatlas-row enviroatlas-service-row');
    const name = el('span', 'enviroatlas-row-name', service.name);
    name.title = `${service.fullName} (${service.type})`;

    const badge = el('span', 'enviroatlas-badge', service.type === 'ImageServer' ? 'IMG' : 'MAP');

    if (service.type === 'MapServer') {
      const caret = iconButton('enviroatlas-caret', `Expand ${service.name}`, CHEVRON_SVG);
      row.append(caret, name, badge, addButton(service.name, () => ctx.onAdd(service, undefined, service.name)));

      let layersEl: HTMLElement | null = null;
      const toggleService = () => {
        if (layersEl) {
          layersEl.hidden = !layersEl.hidden;
          caret.classList.toggle('expanded', !layersEl.hidden);
          return;
        }
        const loading = statusRow('Loading layers...');
        wrapper.append(loading);
        caret.classList.add('expanded');
        ctx.catalog
          .getServiceMetadata(service)
          .then((metadata) => {
            ctx.onMetadata(service, metadata);
            loading.remove();
            layersEl = metadata.layers.length
              ? renderSublayers(service, metadata.layers, -1)
              : statusRow('No sublayers', 'empty');
            wrapper.append(layersEl);
          })
          .catch((error: Error) => {
            loading.remove();
            caret.classList.remove('expanded');
            wrapper.append(statusRow('Failed to load layers', 'error'));
            ctx.onError(error);
          });
      };
      caret.addEventListener('click', toggleService);
      name.addEventListener('click', toggleService);
    } else {
      name.classList.add('enviroatlas-leaf');
      row.append(name, badge, addButton(service.name, () => ctx.onAdd(service, undefined, service.name)));
    }

    wrapper.prepend(row);
    return wrapper;
  }

  function renderFolder(folder: string): HTMLElement {
    const wrapper = el('div', 'enviroatlas-folder');
    const row = el('div', 'enviroatlas-row enviroatlas-folder-row');
    const caret = iconButton('enviroatlas-caret', `Expand ${folder}`, CHEVRON_SVG);
    const name = el('span', 'enviroatlas-row-name', folder);
    row.append(caret, name);
    wrapper.append(row);

    let servicesEl: HTMLElement | null = null;
    const toggleFolder = () => {
      if (servicesEl) {
        servicesEl.hidden = !servicesEl.hidden;
        caret.classList.toggle('expanded', !servicesEl.hidden);
        return;
      }
      const loading = statusRow('Loading services...');
      wrapper.append(loading);
      caret.classList.add('expanded');
      ctx.catalog
        .listServices(folder)
        .then((services) => {
          loading.remove();
          servicesEl = el('div', 'enviroatlas-services');
          if (services.length === 0) {
            servicesEl.append(statusRow('No services', 'empty'));
          }
          for (const service of services) {
            servicesEl.append(renderService(service));
          }
          wrapper.append(servicesEl);
        })
        .catch((error: Error) => {
          loading.remove();
          caret.classList.remove('expanded');
          wrapper.append(statusRow('Failed to load services', 'error'));
          ctx.onError(error);
        });
    };
    caret.addEventListener('click', toggleFolder);
    name.addEventListener('click', toggleFolder);

    return wrapper;
  }

  function load(): void {
    if (loaded) return;
    loaded = true;
    const loading = statusRow('Loading catalog...');
    root.append(loading);
    ctx.catalog
      .listFolders()
      .then((folders) => {
        loading.remove();
        if (folders.length === 0) {
          root.append(statusRow('No folders found', 'empty'));
          return;
        }
        for (const folder of folders) {
          root.append(renderFolder(folder));
        }
      })
      .catch((error: Error) => {
        loading.remove();
        loaded = false;
        root.append(statusRow('Failed to load catalog. Click to retry.', 'error'));
        root.lastElementChild?.addEventListener('click', () => {
          root.replaceChildren();
          load();
        });
        ctx.onError(error);
      });
  }

  return { el: root, load };
}
