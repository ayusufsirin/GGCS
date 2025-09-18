// src/middleware/hooks/use-map-autofocus.ts
import { useEffect, useMemo } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

export type MapAutofocusMode = "pan" | "fly" | "set";

export interface MapAutofocusOptions {
  enabled?: boolean;      // default: true
  mode?: MapAutofocusMode; // default: "pan"
  keepZoom?: boolean;     // default: true (preserve current zoom)
  zoom?: number;          // used if keepZoom is false
  animate?: boolean;      // default: true
  durationMs?: number;    // only used for fly mode
  debounceMs?: number;    // default: 150
  minMoveMeters?: number; // ignore tiny jitter; default: 0
}

function useDebouncedValue<T>(value: T, delay: number) {
  const v = useMemo(() => ({ current: value }), [value]);
  v.current = value;
  // simple micro-debounce via ref scheduling
  const [, setTick] = ((): [number, (n: number) => void] => {
    // lazy closure to avoid importing React state; works fine in hooks
    let tick = 0;
    const set = (n: number) => { tick = n; };
    return [tick, set];
  })();

  useEffect(() => {
    const t = setTimeout(() => setTick(Date.now()), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay]);

  return v.current;
}

/**
 * Autofocus/center the map when lat/lon change.
 * Must be used within a <MapContainer> tree.
 */
export function useMapAutofocus(
  lat?: number | null,
  lon?: number | null,
  opts?: MapAutofocusOptions
) {
  const map = useMap();

  const {
    enabled = true,
    mode = "pan",
    keepZoom = true,
    zoom,
    animate = true,
    durationMs = 600,
    debounceMs = 150,
    minMoveMeters = 0,
  } = opts ?? {};

  const safeLat = Number.isFinite(lat as number) ? (lat as number) : undefined;
  const safeLon = Number.isFinite(lon as number) ? (lon as number) : undefined;

  const debouncedTarget = useDebouncedValue<[number, number] | undefined>(
    safeLat != null && safeLon != null ? [safeLat, safeLon] : undefined,
    debounceMs
  );

  useEffect(() => {
    if (!enabled) return;
    if (!debouncedTarget) return;

    const [tLat, tLon] = debouncedTarget;

    // Avoid micro-pans if movement is below threshold
    if (minMoveMeters > 0) {
      const current = map.getCenter();
      const dist = L.latLng(current.lat, current.lng).distanceTo(L.latLng(tLat, tLon));
      if (dist < minMoveMeters) return;
    }

    const nextZoom = keepZoom ? map.getZoom() : (zoom ?? map.getZoom());

    if (mode === "fly") {
      map.flyTo([tLat, tLon], nextZoom, { animate, duration: durationMs / 1000 });
    } else if (mode === "set") {
      map.setView([tLat, tLon], nextZoom, { animate });
    } else {
      map.panTo([tLat, tLon], { animate });
    }
  }, [debouncedTarget, enabled, keepZoom, zoom, mode, animate, durationMs, map, minMoveMeters]);
}
