import { describe, it, expect, vi } from 'vitest';
import { createTreeView } from '../src/lib/ui/treeView';
import type { CatalogClient } from '../src/lib/api/catalog';
import type { ServiceRef } from '../src/lib/api/types';

function service(folder: string, name: string): ServiceRef {
  return { folder, name, fullName: `${folder}/${name}`, type: 'MapServer' };
}

function createFakeCatalog(): CatalogClient {
  return {
    listFolders: vi.fn(() => Promise.resolve(['Communities', 'Rasters'])),
    listServices: vi.fn((folder: string) =>
      Promise.resolve(
        folder === 'Communities'
          ? [service(folder, 'A'), service(folder, 'B')]
          : [service(folder, 'C'), service(folder, 'D'), service(folder, 'E')]
      )
    ),
    getServiceMetadata: vi.fn(() => Promise.resolve({ layers: [] })),
  } as unknown as CatalogClient;
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createTreeView', () => {
  it('shows a service count for each folder', async () => {
    const catalog = createFakeCatalog();
    const tree = createTreeView({
      catalog,
      onAdd: vi.fn(),
      onMetadata: vi.fn(),
      onError: vi.fn(),
    });
    tree.load();
    await flushPromises();

    const rows = [...tree.el.querySelectorAll('.enviroatlas-folder-row')];
    expect(rows).toHaveLength(2);
    const counts = rows.map((row) => row.querySelector('.enviroatlas-count')?.textContent);
    expect(counts).toEqual(['2', '3']);
  });

  it('leaves the count empty when the folder listing fails', async () => {
    const catalog = createFakeCatalog();
    (catalog.listServices as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('down'));
    const tree = createTreeView({
      catalog,
      onAdd: vi.fn(),
      onMetadata: vi.fn(),
      onError: vi.fn(),
    });
    tree.load();
    await flushPromises();

    const counts = [...tree.el.querySelectorAll('.enviroatlas-count')].map((c) => c.textContent);
    expect(counts).toEqual(['', '']);
  });
});
