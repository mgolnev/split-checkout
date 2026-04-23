"use client";

import type { MapEventUpdateHandler } from "@yandex/ymaps3-types";
import { createRoot, type Root } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadYandexMapsScript } from "@/lib/yandex-maps-script";
import { MapStorePin, MAP_STORE_PIN_ANCHOR_OFFSET_X_PX, type MapStorePinProps } from "@/components/MapStorePin";

/** Выше — плашки; ниже — только компактный круг (гистерезис против дрожания на границе). */
const PIN_LABEL_ZOOM_EXPAND = 12.3;
const PIN_LABEL_ZOOM_COLLAPSE = 11.2;

export type YandexCheckoutMapMarker = {
  id: string;
  lng: number;
  lat: number;
  pinProps: MapStorePinProps;
  /** Раскрытая плашка независимо от зума (выбранная точка на карте). */
  pinLabelAlwaysExpanded?: boolean;
  /** Порядок наложения маркеров (API карты); выбранная точка — максимальный индекс с родителя. */
  markerZIndex?: number;
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

type LngLatBoundsTuple = [[number, number], [number, number]];

/**
 * Расширяем bbox вокруг точек, иначе при `setLocation({ bounds })` маркеры оказываются у самого края тайла.
 * Доля от размера bbox + минимум в градусах (~сотни метров), чтобы две близкие точки не «липли» к рамке.
 */
function expandLngLatBounds(
  bounds: LngLatBoundsTuple,
  paddingFraction = 0.3,
  minPadDeg = 0.004,
): LngLatBoundsTuple {
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  const w = Math.max(maxLng - minLng, 0);
  const h = Math.max(maxLat - minLat, 0);
  const padLng = Math.max(w * paddingFraction, minPadDeg);
  const padLat = Math.max(h * paddingFraction, minPadDeg);
  return [
    [minLng - padLng, minLat - padLat],
    [maxLng + padLng, maxLat + padLat],
  ];
}

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
  const tight: LngLatBoundsTuple = [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
  return {
    bounds: expandLngLatBounds(tight),
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
  const pinLabelsExpandedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [pinLabelsExpanded, setPinLabelsExpanded] = useState(false);

  /** Только координаты пинов — чтобы перефитить кадр при смене фильтра, а не при каждом ререндере pinProps. */
  const markersBoundsKey = useMemo(
    () => markers.map((m) => `${m.id}:${m.lng},${m.lat}`).join("|"),
    [markers],
  );

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

        const applyPinLabelZoom = (zoom: number) => {
          let next: boolean;
          if (pinLabelsExpandedRef.current) {
            next = zoom >= PIN_LABEL_ZOOM_COLLAPSE;
          } else {
            next = zoom >= PIN_LABEL_ZOOM_EXPAND;
          }
          if (next !== pinLabelsExpandedRef.current) {
            pinLabelsExpandedRef.current = next;
            setPinLabelsExpanded(next);
          }
        };

        const z0 = map.zoom;
        if (Number.isFinite(z0)) {
          pinLabelsExpandedRef.current = z0 >= PIN_LABEL_ZOOM_EXPAND;
          setPinLabelsExpanded(pinLabelsExpandedRef.current);
        }

        const onMapUpdate: MapEventUpdateHandler = (object) => {
          if (object.type !== "update") return;
          applyPinLabelZoom(object.location.zoom);
        };

        const listener = new YMapListener({
          onUpdate: onMapUpdate,
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
          pinLabelsExpandedRef.current,
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
      pinLabelsExpanded,
    );
  }, [markers, mapReady, pinLabelsExpanded]);

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

  /**
   * При смене набора точек (фильтр, поиск) без выбранного превью карта остаётся на старом кадре — пины «вне экрана».
   * Подгоняем область видимости под текущие маркеры (как при первом открытии).
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const hasFocus =
      focus != null &&
      Number.isFinite(focus.lng) &&
      Number.isFinite(focus.lat);
    if (hasFocus) return;

    const loc = initialLocationForMarkers(markers);
    if ("bounds" in loc && loc.bounds) {
      map.setLocation({ bounds: loc.bounds, duration: 220 });
      return;
    }
    if ("center" in loc && loc.center && "zoom" in loc) {
      map.setLocation({ center: loc.center, zoom: loc.zoom, duration: 220 });
    }
  }, [markersBoundsKey, mapReady, focus?.lng, focus?.lat, markers]);

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
  pinLabelsExpanded: boolean,
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
    const labelLayout: MapStorePinProps["labelLayout"] =
      m.pinLabelAlwaysExpanded || pinLabelsExpanded ? "expanded" : "compact";
    const zIndex = m.markerZIndex ?? 1;
    const pinMerged: MapStorePinProps = { ...m.pinProps, labelLayout };

    const existing = entityById.get(m.id);
    if (existing) {
      existing.update({ coordinates: [m.lng, m.lat], zIndex });
      const root = roots.get(m.id);
      if (root) {
        root.render(<MapStorePin {...pinMerged} />);
      }
      continue;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    /** inline-flex + w-max/h-fit — bbox кнопки совпадает с пином; без отдельного «слоя» inset (раньше −14px со всех сторон давал огромную зону под/вокруг пина и миссклики по карте). */
    btn.className =
      "relative inline-flex h-fit w-max max-w-none shrink-0 overflow-visible border-0 bg-transparent p-0 text-left shadow-none outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 touch-manipulation";
    btn.setAttribute("aria-label", "Выбрать точку на карте");
    const forwardMarkerClick = (e: Event) => {
      e.stopPropagation();
      onMarkerSelect(m.id);
    };
    btn.addEventListener("click", forwardMarkerClick);

    const inner = document.createElement("div");
    inner.className = "relative z-[1]";
    inner.style.transform = `translate(${-MAP_STORE_PIN_ANCHOR_OFFSET_X_PX}px, -100%)`;
    btn.appendChild(inner);

    const root = createRoot(inner);
    root.render(<MapStorePin {...pinMerged} />);
    roots.set(m.id, root);

    const marker = new YMapMarker(
      {
        coordinates: [m.lng, m.lat],
        zIndex,
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
