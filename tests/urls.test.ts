import { describe, it, expect } from 'vitest';
import {
  buildCatalogUrl,
  buildFolderUrl,
  buildServiceUrl,
  buildLegendUrl,
  buildExportUrl,
  buildExportImageUrl,
  buildTileTemplate,
  DEFAULT_SERVICES_URL,
} from '../src/lib/api/urls';
import type { ServiceRef } from '../src/lib/api/types';

const mapServer: ServiceRef = {
  folder: 'Supplemental',
  name: 'PADUS',
  fullName: 'Supplemental/PADUS',
  type: 'MapServer',
};

const imageServer: ServiceRef = {
  folder: 'Rasters',
  name: 'Forest_connectivity_CONUS_2024',
  fullName: 'Rasters/Forest_connectivity_CONUS_2024',
  type: 'ImageServer',
};

describe('buildCatalogUrl', () => {
  it('builds the catalog root URL', () => {
    expect(buildCatalogUrl()).toBe('https://enviroatlas.epa.gov/arcgis/rest/services?f=json');
  });

  it('trims trailing slashes from a custom root', () => {
    expect(buildCatalogUrl('https://example.com/arcgis/rest/services/')).toBe(
      'https://example.com/arcgis/rest/services?f=json'
    );
  });
});

describe('buildFolderUrl', () => {
  it('builds a folder listing URL', () => {
    expect(buildFolderUrl('Communities')).toBe(`${DEFAULT_SERVICES_URL}/Communities?f=json`);
  });
});

describe('buildServiceUrl', () => {
  it('builds a MapServer metadata URL', () => {
    expect(buildServiceUrl(mapServer)).toBe(`${DEFAULT_SERVICES_URL}/Supplemental/PADUS/MapServer?f=json`);
  });

  it('builds an ImageServer metadata URL', () => {
    expect(buildServiceUrl(imageServer)).toBe(
      `${DEFAULT_SERVICES_URL}/Rasters/Forest_connectivity_CONUS_2024/ImageServer?f=json`
    );
  });
});

describe('buildLegendUrl', () => {
  it('builds a legend URL', () => {
    expect(buildLegendUrl(mapServer)).toBe(`${DEFAULT_SERVICES_URL}/Supplemental/PADUS/MapServer/legend?f=json`);
  });
});

describe('buildExportUrl', () => {
  it('builds a whole-service export template with the bbox placeholder', () => {
    expect(buildExportUrl(mapServer)).toBe(
      `${DEFAULT_SERVICES_URL}/Supplemental/PADUS/MapServer/export` +
        '?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857' +
        '&size=256,256&format=png32&transparent=true&f=image'
    );
  });

  it('adds layers=show for a sublayer', () => {
    expect(buildExportUrl(mapServer, 7)).toContain('&layers=show:7');
  });

  it('respects tile size and image format options', () => {
    const url = buildExportUrl(mapServer, undefined, { tileSize: 512, imageFormat: 'png24' });
    expect(url).toContain('size=512,512');
    expect(url).toContain('format=png24');
  });

  it('includes sublayer id 0', () => {
    expect(buildExportUrl(mapServer, 0)).toContain('&layers=show:0');
  });
});

describe('buildExportImageUrl', () => {
  it('builds an ImageServer exportImage template', () => {
    expect(buildExportImageUrl(imageServer)).toBe(
      `${DEFAULT_SERVICES_URL}/Rasters/Forest_connectivity_CONUS_2024/ImageServer/exportImage` +
        '?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857' +
        '&size=256,256&format=png32&transparent=true&f=image'
    );
  });
});

describe('buildTileTemplate', () => {
  it('routes MapServers to export', () => {
    expect(buildTileTemplate(mapServer, 3)).toContain('/MapServer/export?');
    expect(buildTileTemplate(mapServer, 3)).toContain('layers=show:3');
  });

  it('routes ImageServers to exportImage', () => {
    expect(buildTileTemplate(imageServer)).toContain('/ImageServer/exportImage?');
  });

  it('ignores sublayer ids for ImageServers', () => {
    expect(buildTileTemplate(imageServer, 3)).not.toContain('layers=show');
  });
});
