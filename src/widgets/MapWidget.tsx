import React, { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css"; // Ensure Leaflet CSS is loaded
import { Circle, LayersControl, MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";
import L, { DivIcon, LatLngExpression, Marker as LeafletMarker } from "leaflet";
import "leaflet-rotatedmarker"; // extends Leaflet's Marker with rotation
import { useAttr } from "../middleware/hooks/use-attr";
import homeIconUrl from "./images/map/home_icon.png";
import vehicleIconUrl from "./images/map/vehicle_icon.png";

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

// Build a DivIcon for waypoint labels (index shown)
function waypointIcon(index: number): DivIcon {
  return L.divIcon({
    className: "waypoint-icon",
    html: `<div class="waypoint-label">${index}</div>`,
    iconSize: [25, 25],
    iconAnchor: [12, 12],
  });
}

export function MapWidget() {
  // ---- Widget attributes ----
  const lat = useAttr<number>("latitude");      // degrees
  const lon = useAttr<number>("longitude");     // degrees
  const heading = useAttr<number>("heading");   // degrees

  // Optional attrs with sensible defaults
  // TODO: Implement constant type (near topic type) to the Widget interface
  const waypointsUrl = useAttr<string>("waypointsUrl") ?? "/waypoints";
  // const vehicleIconUrl = useAttr<string>("vehicleIconUrl") ?? "./images/map/vehicle_icon.png";
  // const homeIconUrl = useAttr<string>("homeIconUrl") ?? "./images/map/home_icon.png";
  const initialZoom = useAttr<number>("initialZoom") ?? DEFAULT_ZOOM;
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
  const endOfHeading = useMemo<[number, number] | null>(() => {
    if (lat == null || lon == null) return null;
    const hdg = Number.isFinite(heading as number) ? (heading as number) : 0;
    return calculateEndpoint(lat, lon, hdg, 1000);
  }, [lat, lon, heading]);

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

      {/* Heading line (1 km) */}
      {lat != null && lon != null && endOfHeading && (
        <Polyline positions={[[lat, lon], endOfHeading]} pathOptions={{ color: "black", weight: 2 }} />
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
