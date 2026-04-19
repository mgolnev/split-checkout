"use client";

import { createRoot, type Root } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { loadYandexMapsScript } from "@/lib/yandex-maps-script";
import { MapStorePin, MAP_STORE_PIN_ANCHOR_OFFSET_X_PX, type MapStorePinProps } from "@/components/MapStorePin";

export type YandexCheckoutMapMarker = {
  id: string;
  lng: number;
  lat: number;
  pinProps: MapStorePinProps;
};

type YandexCheckoutMapProps = {
  markers: YandexCheckoutMapMarker[];
  /** Центрировать карту на точке (превью выбранного пина). */
  focus: { lng: number; lat: number } | null;
  /**
   * Нижний отступ «безопасной области» карты в px (высота шторки снизу).
   * Точка фокуса попадает в центр области над шторкой, а не в центр всего экрана.
   */
  focusInsetBottomPx?: number;
  /** Дополнительный нижний отступ при фокусе — смещает точку чуть выше (над шторкой). */
  focusExtraBottomPx?: number;
  onMarkerSelect: (id: string) => void;
  onBackgroundDismiss: () => void;
  className?: string;
};

type YMapModule = typeof import("@yandex/ymaps3-types");

function initialLocationForMarkers(
  markers: YandexCheckoutMapMarker[],
): import("@yandex/ymaps3-types").YMapLocationRequest {
  const pts = markers.map((m) => ({ lng: m.lng, lat: m.lat }));
  if (pts.length === 0) {
    return { center: [37.617644, 55.755819], zoom: 10 };
  }
  if (pts.length === 1) {
    const p = pts[0]!;
    return { center: [p.lng, p.lat], zoom: 14 };
  }
  let minLng = pts[0]!.lng;
  let maxLng = pts[0]!.lng;
  let minLat = pts[0]!.lat;
  let maxLat = pts[0]!.lat;
  for (const p of pts) {
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
  }
  if (minLng === maxLng && minLat === maxLat) {
    return { center: [minLng, minLat], zoom: 14 };
  }
  return {
    bounds: [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
  };
}

/**
 * Подложка Яндекс.Карт + кастомные пины {@link MapStorePin} через `YMapMarker`.
 */
const DEFAULT_FOCUS_EXTRA_BOTTOM_PX = 40;

export function YandexCheckoutMap({
  markers,
  focus,
  focusInsetBottomPx = 0,
  focusExtraBottomPx = DEFAULT_FOCUS_EXTRA_BOTTOM_PX,
  onMarkerSelect,
  onBackgroundDismiss,
  className = "",
}: YandexCheckoutMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<InstanceType<YMapModule["YMap"]> | null>(null);
  const markerRootsRef = useRef<Map<string, Root>>(new Map());
  const markerEntitiesRef = useRef<Map<string, InstanceType<YMapModule["YMapMarker"]>>>(new Map());
  const handlersRef = useRef({ onMarkerSelect, onBackgroundDismiss });
  handlersRef.current = { onMarkerSelect, onBackgroundDismiss };
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    let map: InstanceType<YMapModule["YMap"]> | null = null;

    (async () => {
      try {
        await loadYandexMapsScript();
        if (cancelled || !containerRef.current) return;

        const ymaps3 = (window as unknown as { ymaps3: YMapModule }).ymaps3;
        const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapMarker, YMapListener } = ymaps3;

        map = new YMap(containerRef.current, {
          location: initialLocationForMarkers(markersRef.current),
          theme: "light",
        });
        map.addChild(new YMapDefaultSchemeLayer({}));
        map.addChild(new YMapDefaultFeaturesLayer({}));

        const listener = new YMapListener({
          onFastClick: (object) => {
            if (object && (object as { type?: string }).type === "marker") return;
            handlersRef.current.onBackgroundDismiss();
          },
        });
        map.addChild(listener);

        mapRef.current = map;
        syncMarkers(
          map,
          YMapMarker,
          markersRef.current,
          markerEntitiesRef.current,
          markerRootsRef.current,
          (id) => handlersRef.current.onMarkerSelect(id),
        );
        setMapReady(true);
      } catch {
        handlersRef.current.onBackgroundDismiss();
      }
    })();

    return () => {
      cancelled = true;
      setMapReady(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const rootsSnapshot = markerRootsRef.current;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const entitiesSnapshot = markerEntitiesRef.current;
      const mapInstance = map;
      mapRef.current = null;
      queueMicrotask(() => {
        for (const root of rootsSnapshot.values()) {
          root.unmount();
        }
        rootsSnapshot.clear();
        entitiesSnapshot.clear();
        if (mapInstance) {
          mapInstance.destroy();
        }
      });
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const ymaps3 = (window as unknown as { ymaps3: YMapModule }).ymaps3;
    if (!ymaps3?.YMapMarker) return;
    syncMarkers(
      map,
      ymaps3.YMapMarker,
      markers,
      markerEntitiesRef.current,
      markerRootsRef.current,
      (id) => handlersRef.current.onMarkerSelect(id),
    );
  }, [markers, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const hasFocus =
      focus != null &&
      Number.isFinite(focus.lng) &&
      Number.isFinite(focus.lat);
    const bottomMargin = hasFocus
      ? Math.max(0, focusInsetBottomPx) + Math.max(0, focusExtraBottomPx)
      : 0;
    map.setMargin([0, 0, bottomMargin, 0]);
    if (!hasFocus || !focus) return;
    map.setLocation({
      center: [focus.lng, focus.lat],
      zoom: Math.max(map.zoom, 15),
      duration: 220,
    });
    // Объект focus из родителя может пересоздаваться; достаточно lng/lat.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- см. выше
  }, [focus?.lng, focus?.lat, focusInsetBottomPx, focusExtraBottomPx, mapReady]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-0 ${className}`}
      role="region"
      aria-label="Карта с точками выбора"
    />
  );
}

function syncMarkers(
  map: InstanceType<YMapModule["YMap"]>,
  YMapMarker: YMapModule["YMapMarker"],
  markers: YandexCheckoutMapMarker[],
  entityById: Map<string, InstanceType<YMapModule["YMapMarker"]>>,
  roots: Map<string, Root>,
  onMarkerSelect: (id: string) => void,
) {
  const nextIds = new Set(markers.map((m) => m.id));

  for (const [id, entity] of entityById) {
    if (!nextIds.has(id)) {
      const root = roots.get(id);
      if (root) {
        root.unmount();
        roots.delete(id);
      }
      map.removeChild(entity);
      entityById.delete(id);
    }
  }

  for (const m of markers) {
    const existing = entityById.get(m.id);
    if (existing) {
      existing.update({ coordinates: [m.lng, m.lat] });
      const root = roots.get(m.id);
      if (root) {
        root.render(<MapStorePin {...m.pinProps} />);
      }
      continue;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "relative overflow-visible border-0 bg-transparent p-0 text-left shadow-none outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 touch-manipulation";
    btn.setAttribute("aria-label", "Выбрать точку на карте");
    const forwardMarkerClick = (e: Event) => {
      e.stopPropagation();
      onMarkerSelect(m.id);
    };
    btn.addEventListener("click", forwardMarkerClick);

    /** Расширение зоны нажатия (~44px+), не смещая визуал пина */
    const hitSlop = document.createElement("div");
    hitSlop.setAttribute("aria-hidden", "true");
    hitSlop.className = "pointer-events-auto absolute -inset-[14px] z-0";
    btn.appendChild(hitSlop);

    const inner = document.createElement("div");
    inner.className = "relative z-[1]";
    inner.style.transform = `translate(${-MAP_STORE_PIN_ANCHOR_OFFSET_X_PX}px, -100%)`;
    btn.appendChild(inner);

    const root = createRoot(inner);
    root.render(<MapStorePin {...m.pinProps} />);
    roots.set(m.id, root);

    const marker = new YMapMarker(
      {
        coordinates: [m.lng, m.lat],
        zIndex: 1,
        onClick: (e) => {
          e.stopPropagation();
          onMarkerSelect(m.id);
        },
      },
      btn,
    );
    map.addChild(marker);
    entityById.set(m.id, marker);
  }
}
