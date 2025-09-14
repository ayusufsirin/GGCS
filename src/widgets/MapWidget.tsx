import React from "react";
import { useAttr } from "../middleware/hooks/use-attr";

// ---- Helpers ----
const DEFAULT_CENTER: LatLngExpression = [39.87, 32.775];
const DEFAULT_ZOOM = 5;
const DEFAULT_MAX_ZOOM = 50;
const DEFAULT_PATH_LEN = 50_000;

function calculateEndpoint(lat: number, lng: number, headingDeg: number, lengthMeters: number): [number, number] {
  const R = 6_378_137; // Earth radius in meters
  const delta = lengthMeters / R; // angular distance in radians
  const theta = (headingDeg * Math.PI) / 180; // heading to radians
  const endLat = lat + (delta * Math.cos(theta)) * (180 / Math.PI);
  const endLng = lng + ((delta * Math.sin(theta)) * (180 / Math.PI)) / Math.cos((lat * Math.PI) / 180);
  return [endLat, endLng];
}

export function MapWidget() {
  // ---- Widget attributes ----
  const lat = useAttr<number>("latitude");      // degrees
  const lon = useAttr<number>("longitude");     // degrees
  const heading = useAttr<number>("heading");   // degrees

  // Optional attrs with sensible defaults
  const waypointsUrl = useAttr<string>("waypointsUrl") ?? "/waypoints";
  const vehicleIconUrl = useAttr<string>("vehicleIconUrl") ?? "/static/images/vehicle_icon.png";
  const homeIconUrl = useAttr<string>("homeIconUrl") ?? "/static/images/home_icon.png";
  const initialZoom = useAttr<number>("initialZoom") ?? DEFAULT_ZOOM;
  const maxZoom = useAttr<number>("maxZoom") ?? DEFAULT_MAX_ZOOM;
  const maxPathLength = useAttr<number>("maxPathLength") ?? DEFAULT_PATH_LEN;

  // You can also allow overriding initial center via attrs
  const centerLat = useAttr<number>("centerLat") ?? (Array.isArray(DEFAULT_CENTER) ? (DEFAULT_CENTER as number[])[0] : 39.87);
  const centerLon = useAttr<number>("centerLon") ?? (Array.isArray(DEFAULT_CENTER) ? (DEFAULT_CENTER as number[])[1] : 32.775);

  // ---- Refs ----
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  // Layers/graphics refs
  const vehicleMarkerRef = useRef<LeafletMarker | null>(null);
  const headingLineRef = useRef<L.Polyline | null>(null);
  const pathPolylineRef = useRef<L.Polyline | null>(null);
  const homeMarkerRef = useRef<LeafletMarker | null>(null);
  const vehiclePathRef = useRef<[number, number][]>([]);

  // Keep references to layers we add so we can remove/cleanup precisely
  const ownedLayersRef = useRef<Set<Layer>>(new Set());
  const polylineRef = useRef<L.Polyline | null>(null);
  const waypointsLoadedRef = useRef<boolean>(false);

  // ---- Initialize map once ----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView([centerLat, centerLon], initialZoom);
    mapRef.current = map;

    // Base layers
    const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom }).addTo(map);
    const hot = L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", { maxZoom }).addTo(map);
    const googleSat = L.tileLayer("http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
      maxZoom,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
    }).addTo(map);

    const overlays: Record<string, Layer> = { Street: street, HOT: hot, Satellite: googleSat };
    L.control.layers(undefined, overlays).addTo(map);

    return () => {
      overlays && Object.values(overlays).forEach((l) => map.removeLayer(l));
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerLat, centerLon, initialZoom, maxZoom]);

  // ---- Load waypoints once ----
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (waypointsLoadedRef.current) return;
      try {
        const res = await fetch(waypointsUrl);
        if (!res.ok) throw new Error(`Waypoints HTTP ${res.status}`);
        const waypoints: { lat: number; lng: number; proximityRadius?: number }[] = await res.json();
        if (cancelled) return;
        drawWaypoints(waypoints);
        waypointsLoadedRef.current = true;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Waypoints load failed:", e);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [waypointsUrl]);

  // ---- Update vehicle overlays whenever attrs change ----
  useEffect(() => {
    if (lat == null || lon == null) return; // need both to plot
    updateVehicle(lat, lon, heading ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, heading, maxPathLength, vehicleIconUrl, homeIconUrl]);

  // ---- Drawing helpers ----
  const drawWaypoints = (waypoints: { lat: number; lng: number; proximityRadius?: number }[]) => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous waypoint layers we own (markers, circles, polyline)
    ownedLayersRef.current.forEach((layer) => {
      map.removeLayer(layer);
    });
    ownedLayersRef.current.clear();

    if (!waypoints || waypoints.length === 0) return;

    waypoints.forEach((point, index) => {
      const marker = L.marker([point.lat, point.lng], {
        icon: L.divIcon({
          className: "waypoint-icon",
          html: `<div class="waypoint-label">${index}</div>`,
          iconSize: [25, 25],
          iconAnchor: [12, 12],
        }),
        draggable: false,
      }).addTo(map);
      ownedLayersRef.current.add(marker);

      if (point.proximityRadius) {
        const circle = L.circle([point.lat, point.lng], { radius: point.proximityRadius }).addTo(map);
        ownedLayersRef.current.add(circle);
      }
    });

    if (waypoints.length > 1) {
      const latlngs = waypoints.map((p) => [p.lat, p.lng]) as [number, number][];
      const poly = L.polyline(latlngs, { color: "yellow" }).addTo(map);
      ownedLayersRef.current.add(poly);
      polylineRef.current = poly;
    } else {
      polylineRef.current = null;
    }

    // Ensure vehicle overlays remain visible
    if (headingLineRef.current) headingLineRef.current.addTo(map);
    if (pathPolylineRef.current) pathPolylineRef.current.addTo(map);
    if (homeMarkerRef.current) homeMarkerRef.current.addTo(map);
    if (vehicleMarkerRef.current) vehicleMarkerRef.current.addTo(map);
  };

  const updateVehicle = (latitude: number, longitude: number, headingDeg: number) => {
    const map = mapRef.current;
    if (!map) return;

    // Home point (only once)
    if (!homeMarkerRef.current) {
      homeMarkerRef.current = L.marker([latitude, longitude], {
        icon: L.icon({ iconUrl: homeIconUrl, iconSize: [40, 40], iconAnchor: [20, 20] }),
      }).addTo(map);
    }

    // Vehicle marker
    if (vehicleMarkerRef.current) {
      vehicleMarkerRef.current.setLatLng([latitude, longitude]);
      vehicleMarkerRef.current.setRotationAngle?.(headingDeg);
    } else {
      const marker = L.marker([latitude, longitude], {
        icon: L.icon({ iconUrl: vehicleIconUrl, iconSize: [40, 40], iconAnchor: [20, 20] }),
      }) as LeafletMarker;
      marker.setRotationAngle?.(headingDeg);
      marker.setRotationOrigin?.("center center");
      marker.addTo(map);
      vehicleMarkerRef.current = marker;
    }

    // Heading line (1 km)
    const headingLength = 1000;
    const endLatLng = calculateEndpoint(latitude, longitude, headingDeg, headingLength);

    if (headingLineRef.current) {
      headingLineRef.current.setLatLngs([[latitude, longitude], endLatLng]);
    } else {
      headingLineRef.current = L.polyline([[latitude, longitude], endLatLng], { color: "black", weight: 2 }).addTo(map);
    }

    // Vehicle path
    const path = vehiclePathRef.current;
    path.push([latitude, longitude]);
    if (path.length > maxPathLength) path.shift();

    if (pathPolylineRef.current) {
      pathPolylineRef.current.setLatLngs(path);
    } else {
      pathPolylineRef.current = L.polyline(path, { color: "purple", weight: 2 }).addTo(map);
    }

    // Auto-focus if outside view
    if (!map.getBounds().contains([latitude, longitude])) {
      map.setView([latitude, longitude]);
    }
  };

  // Cleanup overlays on unmount
  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (!map) return;
      [vehicleMarkerRef.current, headingLineRef.current, pathPolylineRef.current, homeMarkerRef.current, polylineRef.current]
        .forEach((layer) => layer && map.removeLayer(layer));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
      aria-label="Leaflet Map"
    />
  );
}
