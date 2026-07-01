export interface NaverLatLng {
  lat(): number;
  lng(): number;
}

export interface NaverBounds {
  hasLatLng(latlng: NaverLatLng): boolean;
  getSW(): NaverLatLng;
  getNE(): NaverLatLng;
  extend(latlng: NaverLatLng): NaverBounds;
}

export interface NaverMap {
  setCenter(latlng: NaverLatLng): void;
  setZoom(zoom: number, effect?: boolean): void;
  getZoom(): number;
  getBounds(): NaverBounds;
  panTo(latlng: NaverLatLng, transitionOptions?: { duration?: number; easing?: string }): void;
  morph(latlng: NaverLatLng, zoom?: number, transitionOptions?: { duration?: number }): void;
  fitBounds(bounds: NaverBounds, margin?: { top?: number; right?: number; bottom?: number; left?: number }): void;
  setOptions(options: {
    scaleControl?: boolean;
    logoControl?: boolean;
    mapDataControl?: boolean;
    zoomControl?: boolean;
    mapTypeControl?: boolean;
  }): void;
}

export interface NaverMarker {
  setMap(map: NaverMap | null): void;
  setPosition(latlng: NaverLatLng): void;
}

export interface NaverPanorama {
  setPosition(latlng: NaverLatLng): void;
  getPanoId?(): string | null;
  destroy?(): void;
}

export interface NaverEventListener {
  remove(): void;
}

export interface NaverNamespace {
  maps: {
    LatLng: new (lat: number, lng: number) => NaverLatLng;
    LatLngBounds: new (sw: NaverLatLng, ne: NaverLatLng) => NaverBounds;
    Map: new (
      container: HTMLElement,
      options: {
        center: NaverLatLng;
        zoom: number;
        scaleControl?: boolean;
        logoControl?: boolean;
        mapDataControl?: boolean;
        zoomControl?: boolean;
        mapTypeControl?: boolean;
      }
    ) => NaverMap;
    Marker: new (options: {
      position: NaverLatLng;
      map?: NaverMap;
      icon?: {
        content: string | HTMLElement;
        anchor?: { x: number; y: number };
      };
      clickable?: boolean;
      zIndex?: number;
    }) => NaverMarker;
    Panorama: new (
      container: HTMLElement,
      options: {
        position: NaverLatLng;
        pov?: { pan?: number; tilt?: number; fov?: number };
        flightSpot?: boolean;
        logoControl?: boolean;
        zoomControl?: boolean;
        aroundControl?: boolean;
        minScale?: number;
        maxScale?: number;
      }
    ) => NaverPanorama;
    Event: {
      addListener(
        target: NaverPanorama | NaverMap | NaverMarker,
        event: string,
        fn: (...args: unknown[]) => void,
      ): NaverEventListener;
    };
  };
}

declare global {
  interface Window {
    naver?: NaverNamespace;
  }
}

export {};
