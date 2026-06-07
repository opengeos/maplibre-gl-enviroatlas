/**
 * Pure URL builders for the EnviroAtlas ArcGIS REST API.
 *
 * All builders are side-effect free so they can be unit tested
 * without any network access.
 */
import type { ServiceRef } from './types';

/** Default EnviroAtlas ArcGIS REST services root */
export const DEFAULT_SERVICES_URL = 'https://enviroatlas.epa.gov/arcgis/rest/services';

/** Placeholder MapLibre replaces with the tile bounding box (EPSG:3857) */
export const BBOX_PLACEHOLDER = '{bbox-epsg-3857}';

/**
 * Options shared by the raster export URL builders.
 */
export interface ExportUrlOptions {
  /** Tile size in pixels @default 256 */
  tileSize?: number;
  /** ArcGIS image format @default 'png32' */
  imageFormat?: string;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Builds the catalog root URL returning the folder list.
 *
 * @param servicesUrl - The ArcGIS REST services root
 * @returns The catalog JSON URL
 */
export function buildCatalogUrl(servicesUrl: string = DEFAULT_SERVICES_URL): string {
  return `${trimTrailingSlash(servicesUrl)}?f=json`;
}

/**
 * Builds the URL listing services within a folder.
 *
 * @param folder - The folder name (e.g. "Communities")
 * @param servicesUrl - The ArcGIS REST services root
 * @returns The folder JSON URL
 */
export function buildFolderUrl(folder: string, servicesUrl: string = DEFAULT_SERVICES_URL): string {
  return `${trimTrailingSlash(servicesUrl)}/${encodeURIComponent(folder)}?f=json`;
}

/**
 * Builds the metadata URL for a service (layer list, description, ...).
 *
 * @param service - The service reference
 * @param servicesUrl - The ArcGIS REST services root
 * @returns The service metadata JSON URL
 */
export function buildServiceUrl(service: ServiceRef, servicesUrl: string = DEFAULT_SERVICES_URL): string {
  return `${trimTrailingSlash(servicesUrl)}/${service.fullName}/${service.type}?f=json`;
}

/**
 * Builds the legend URL for a service.
 *
 * @param service - The service reference
 * @param servicesUrl - The ArcGIS REST services root
 * @returns The legend JSON URL
 */
export function buildLegendUrl(service: ServiceRef, servicesUrl: string = DEFAULT_SERVICES_URL): string {
  return `${trimTrailingSlash(servicesUrl)}/${service.fullName}/${service.type}/legend?f=json`;
}

/**
 * Builds a MapServer dynamic export tile template for use as a
 * MapLibre raster source `tiles` entry. The `{bbox-epsg-3857}`
 * placeholder is substituted by MapLibre per tile request.
 *
 * @param service - The MapServer service reference
 * @param sublayerId - Optional layer (or group layer) id to render exclusively
 * @param options - Tile size and image format options
 * @param servicesUrl - The ArcGIS REST services root
 * @returns The export tile URL template
 */
export function buildExportUrl(
  service: ServiceRef,
  sublayerId?: number,
  options: ExportUrlOptions = {},
  servicesUrl: string = DEFAULT_SERVICES_URL
): string {
  const { tileSize = 256, imageFormat = 'png32' } = options;
  const base = `${trimTrailingSlash(servicesUrl)}/${service.fullName}/MapServer/export`;
  const params =
    `bbox=${BBOX_PLACEHOLDER}&bboxSR=3857&imageSR=3857` +
    `&size=${tileSize},${tileSize}&format=${imageFormat}&transparent=true&f=image` +
    (sublayerId !== undefined ? `&layers=show:${sublayerId}` : '');
  return `${base}?${params}`;
}

/**
 * Builds an ImageServer exportImage tile template for use as a
 * MapLibre raster source `tiles` entry.
 *
 * @param service - The ImageServer service reference
 * @param options - Tile size and image format options
 * @param servicesUrl - The ArcGIS REST services root
 * @returns The exportImage tile URL template
 */
export function buildExportImageUrl(
  service: ServiceRef,
  options: ExportUrlOptions = {},
  servicesUrl: string = DEFAULT_SERVICES_URL
): string {
  const { tileSize = 256, imageFormat = 'png32' } = options;
  const base = `${trimTrailingSlash(servicesUrl)}/${service.fullName}/ImageServer/exportImage`;
  const params =
    `bbox=${BBOX_PLACEHOLDER}&bboxSR=3857&imageSR=3857` +
    `&size=${tileSize},${tileSize}&format=${imageFormat}&transparent=true&f=image`;
  return `${base}?${params}`;
}

/**
 * Builds the raster tile template for any service type.
 *
 * @param service - The service reference
 * @param sublayerId - Optional MapServer sublayer id (ignored for ImageServers)
 * @param options - Tile size and image format options
 * @param servicesUrl - The ArcGIS REST services root
 * @returns The tile URL template for a MapLibre raster source
 */
export function buildTileTemplate(
  service: ServiceRef,
  sublayerId?: number,
  options: ExportUrlOptions = {},
  servicesUrl: string = DEFAULT_SERVICES_URL
): string {
  return service.type === 'ImageServer'
    ? buildExportImageUrl(service, options, servicesUrl)
    : buildExportUrl(service, sublayerId, options, servicesUrl);
}
