import React, { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css"; // Ensure Leaflet CSS is loaded
import { Circle, LayersControl, MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import L, { DivIcon, LatLngExpression, Marker as LeafletMarker } from "leaflet";
import { useAttr } from "../middleware/hooks/use-attr";
import homeIconUrl from "./images/map/home_icon.png";
import vehicleIconUrl from "./images/map/vehicle_icon.png";

// ---- Helpers ----
const DEFAULT_CENTER: LatLngExpression = [21.422487, 39.826206];
const DEFAULT_ZOOM = 5;
const DEFAULT_MAX_ZOOM = 50;
const DEFAULT_PATH_LEN = 50_000;

// Build a DivIcon for waypoint labels (index shown)
function waypointIcon(index: number): DivIcon {
  return L.divIcon({
    className: "waypoint-icon",
    html: `<div class="waypoint-label">${index}</div>`,
    iconSize: [25, 25],
    iconAnchor: [12, 12],
  });
}

type Props = {
  initialZoom: number
}

export function MapWidget({ initialZoom = DEFAULT_ZOOM }: Props) {
  // ---- Widget attributes ----
  const lat = useAttr<number>("latitude");      // degrees
  const lon = useAttr<number>("longitude");     // degrees
  const heading = useAttr<number>("heading");   // degrees

  // Optional attrs with sensible defaults
  // TODO: Implement constant type (near topic type) to the Widget interface
  const waypointsUrl = useAttr<string>("waypointsUrl") ?? "/waypoints";
  // const vehicleIconUrl = useAttr<string>("vehicleIconUrl") ?? "./images/map/vehicle_icon.png";
  // const homeIconUrl = useAttr<string>("homeIconUrl") ?? "./images/map/home_icon.png";
  const maxZoom = useAttr<number>("maxZoom") ?? DEFAULT_MAX_ZOOM;
  const maxPathLength = useAttr<number>("maxPathLength") ?? DEFAULT_PATH_LEN;

  const centerLat = useAttr<number>("centerLat") ?? (DEFAULT_CENTER as number[])[0];
  const centerLon = useAttr<number>("centerLon") ?? (DEFAULT_CENTER as number[])[1];

  // ---- State & Refs ----
  const [waypoints, setWaypoints] = useState<{ lat: number; lng: number; proximityRadius?: number }[]>([]);
  const [path, setPath] = useState<[number, number][]>([]);
  const [home, setHome] = useState<[number, number] | null>(null);

  const vehicleMarkerRef = useRef<LeafletMarker | null>(null);

  // ---- Load waypoints once ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(waypointsUrl);
        if (!res.ok) throw new Error(`Waypoints HTTP ${res.status}`);
        const data: { lat: number; lng: number; proximityRadius?: number }[] = await res.json();
        if (!cancelled) setWaypoints(data || []);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Waypoints load failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [waypointsUrl]);

  // ---- Update vehicle overlays whenever attrs change ----
  useEffect(() => {
    if (lat == null || lon == null) return; // need both to plot

    // Set home once at first valid coordinate
    setHome((prev) => prev ?? [lat, lon]);

    // append to trail
    setPath((prev) => {
      const next = [...prev, [lat, lon] as [number, number]];
      if (next.length > maxPathLength) next.shift();
      return next;
    });

    // rotate marker if available
    const hdg = Number.isFinite(heading as number) ? (heading as number) : 0;
    if (vehicleMarkerRef.current?.setRotationAngle) {
      vehicleMarkerRef.current.setRotationAngle(hdg);
      vehicleMarkerRef.current.setRotationOrigin?.("center center");
    }
  }, [lat, lon, heading, maxPathLength]);

  // ---- Icons ----
  const vehicleIcon = useMemo(
    () => L.icon({ iconUrl: vehicleIconUrl, iconSize: [40, 40], iconAnchor: [20, 20] }),
    []
  );
  const homeIcon = useMemo(
    () => L.icon({ iconUrl: homeIconUrl, iconSize: [40, 40], iconAnchor: [20, 20] }),
    []
  );

  // ---- Derived values ----
  const mapCenter = useMemo<LatLngExpression>(() => [centerLat, centerLon], [centerLat, centerLon]);

  return (
    <MapContainer
      center={mapCenter}
      zoom={initialZoom}
      style={{ width: "100%", height: "100%" }}
      scrollWheelZoom
    >
      <LayersControl position="topright">
        <MapFollow lat={lat} lon={lon} />
        <LayersControl.BaseLayer checked name="Street">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={maxZoom} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="HOT">
          <TileLayer url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maxZoom={maxZoom} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer
            url="https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
            maxZoom={maxZoom}
            subdomains={["mt0", "mt1", "mt2", "mt3"]}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      {/* Waypoints: markers + proximity circles + connecting polyline */}
      {waypoints.map((wp, i) => (
        <React.Fragment key={`wp-${i}`}>
          <Marker position={[wp.lat, wp.lng]} icon={waypointIcon(i)} />
          {wp.proximityRadius ? (
            <Circle center={[wp.lat, wp.lng]} radius={wp.proximityRadius} />
          ) : null}
        </React.Fragment>
      ))}
      {waypoints.length > 1 && (
        <Polyline positions={waypoints.map((w) => [w.lat, w.lng]) as [number, number][]}
                  pathOptions={{ color: "yellow" }} />
      )}

      {/* Home marker (first coordinate seen) */}
      {home && <Marker position={home} icon={homeIcon} />}

      {/* Vehicle marker with rotation via ref to LeafletMarker */}
      {lat != null && lon != null && (
        <Marker
          position={[lat, lon]}
          icon={vehicleIcon}
          zIndexOffset={10000}
          ref={(marker) => {
            // react-leaflet passes Leaflet instance via this ref
            // setRotationAngle only exists after leaflet-rotatedmarker side-effect import
            vehicleMarkerRef.current = (marker as any)?._leaflet_id ? (marker as any) : (marker as unknown as LeafletMarker);
            // Try to rotate immediately
            const hdg = Number.isFinite(heading as number) ? (heading as number) : 0;
            vehicleMarkerRef.current?.setRotationAngle?.(hdg);
            vehicleMarkerRef.current?.setRotationOrigin?.("center center");
          }}
        />
      )}

      {/* Heading line from vehicle to edge of current map view */}
      {lat != null && lon != null && (
        <HeadingRay lat={lat} lon={lon} heading={heading} />
      )}

      {/* Path trail */}
      {path.length > 1 && (
        <Polyline positions={path} pathOptions={{ color: "purple", weight: 2 }} />
      )}
    </MapContainer>
  );
}

function MapFollow({ lat, lon }: { lat?: number | null; lon?: number | null }) {
  const { useMapAutofocus } = require("./hooks/map/use-map-autofocus") as typeof import("./hooks/map/use-map-autofocus");
  useMapAutofocus(lat ?? undefined, lon ?? undefined, {
    enabled: true,
    mode: "pan",        // "fly" for smooth flight, "set" for immediate setView
    debounceMs: 150,    // small debounce to smooth GPS jitter
    keepZoom: true,     // keep current zoom while following
    minMoveMeters: 0    // set >0 to ignore tiny jitter
  });
  return null;
}

// Draws a ray from the vehicle to the current map viewport edge along heading
function HeadingRay({ lat, lon, heading }: { lat: number; lon: number; heading?: number | null }) {
  const map = useMap();
  const [end, setEnd] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (lat == null || lon == null) return;

    const compute = () => {
      const size = map.getSize();
      const w = size.x;
      const h = size.y;

      // Project vehicle position to pixel space
      const p = map.project(L.latLng(lat, lon));

      // Heading in radians, 0 = North, clockwise; convert to pixel-space vector (y grows down)
      const hdg = Number.isFinite(heading as number) ? (heading as number) : 0;
      const theta = (hdg * Math.PI) / 180;
      const vx = Math.sin(theta);
      const vy = -Math.cos(theta);

      // If vector is zero (shouldn't happen), skip
      if (Math.abs(vx) < 1e-9 && Math.abs(vy) < 1e-9) {
        setEnd(null);
        return;
      }

      // Compute t to each screen edge and pick the smallest positive
      const ts: number[] = [];

      if (vx > 0) ts.push((w - p.x) / vx);
      else if (vx < 0) ts.push((0 - p.x) / vx);

      if (vy > 0) ts.push((h - p.y) / vy);
      else if (vy < 0) ts.push((0 - p.y) / vy);

      const candidates = ts.filter((t) => t > 0 && Number.isFinite(t));
      if (!candidates.length) {
        setEnd(null);
        return;
      }
      const t = Math.min(...candidates);

      const endPoint = L.point(p.x + vx * t, p.y + vy * t);
      const endLatLng = map.unproject(endPoint);
      setEnd([endLatLng.lat, endLatLng.lng]);
    };

    // Compute immediately and on map changes
    compute();
    map.on("move", compute);
    map.on("zoom", compute);
    map.on("resize", compute);

    return () => {
      map.off("move", compute);
      map.off("zoom", compute);
      map.off("resize", compute);
    };
  }, [lat, lon, heading, map]);

  if (!end) return null;
  return <Polyline positions={[[lat, lon], end]} pathOptions={{ color: "black", weight: 2 }} />;
}
