/**
 * Minimal ambient typings for TMAP Web SDK v2.
 * Reference: https://tmapapi.tmapmobility.com/main.html#webv2/guide/webGuide.sample1
 *
 * The SDK is loaded as a global script and exposes everything under `window.Tmapv2`.
 * Only the surfaces we touch are typed; everything else is `any` to keep us flexible.
 */

export interface TmapLatLng {
  lat(): number;
  lng(): number;
  _lat: number;
  _lng: number;
}

export interface TmapPoint {
  /** Container pixel x (CSS pixels relative to map element) */
  _x: number;
  /** Container pixel y */
  _y: number;
  x: number;
  y: number;
}

export interface TmapProjection {
  /** Convert geographic coordinate to container (CSS) pixel relative to map element */
  fromCoordToContainerPixel(latlng: TmapLatLng): TmapPoint;
  fromContainerPixelToCoord(point: TmapPoint): TmapLatLng;
}

export interface TmapMap {
  getProjection(): TmapProjection;
  getZoom(): number;
  setZoom(z: number): void;
  getCenter(): TmapLatLng;
  setCenter(latlng: TmapLatLng): void;
  /** Pan + zoom to fit the supplied bounds. Available in TMAP v2. */
  fitBounds?: (bounds: TmapLatLngBounds) => void;
  destroy?: () => void;
  // The SDK exposes addListener via Tmapv2.event.addListener; keep this loose.
  [k: string]: unknown;
}

export interface TmapMarker {
  setMap(map: TmapMap | null): void;
  getPosition(): TmapLatLng;
  setPosition(latlng: TmapLatLng): void;
  setIcon?: (url: string) => void;
}

/** Native polyline overlay drawn directly on the map — used by RouteOverlay. */
export interface TmapPolyline {
  setMap(map: TmapMap | null): void;
  setPath?: (path: TmapLatLng[]) => void;
}

/** Native lat/lng bounds object accepted by `map.fitBounds()`. */
export interface TmapLatLngBounds {
  extend(latlng: TmapLatLng): void;
  isEmpty?: () => boolean;
}

export interface Tmapv2Namespace {
  Map: new (
    container: string | HTMLElement,
    options: {
      center: TmapLatLng;
      width?: string | number;
      height?: string | number;
      zoom?: number;
      zoomControl?: boolean;
      scrollwheel?: boolean;
      httpsMode?: boolean;
    }
  ) => TmapMap;
  LatLng: new (lat: number, lng: number) => TmapLatLng;
  Point: new (x: number, y: number) => TmapPoint;
  Marker: new (options: {
    position: TmapLatLng;
    icon?: string;
    iconSize?: TmapPoint;
    map?: TmapMap;
    title?: string;
  }) => TmapMarker;
  Polyline: new (options: {
    path: TmapLatLng[];
    strokeColor?: string;
    strokeWeight?: number;
    strokeOpacity?: number;
    strokeStyle?: string;
    /** Some SDK builds use `direction` arrows on routes — leave optional. */
    direction?: boolean;
    map?: TmapMap;
  }) => TmapPolyline;
  LatLngBounds: new () => TmapLatLngBounds;
  event: {
    addListener: (
      target: TmapMap | TmapMarker,
      type: string,
      handler: (...args: unknown[]) => void
    ) => unknown;
    removeListener: (handle: unknown) => void;
  };
  // POI search REST helpers exist but we'll call the REST API directly via fetch.
  [k: string]: unknown;
}

declare global {
  interface Window {
    Tmapv2?: Tmapv2Namespace;
  }
}

export {};
