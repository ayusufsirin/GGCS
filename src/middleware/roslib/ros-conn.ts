// ros-conn.ts
import ROSLIB from "roslib";

// Read from environment variable if available, otherwise fallback
const envUrl = process.env.REACT_APP_GGCS_ROSBRIDGE_URL;

// Build dynamic URL from current browser location if no env override
function buildDynamicUrl(): string {
  const isSecure = window.location.protocol === "https:";
  const wsScheme = isSecure ? "wss" : "ws";
  const host = window.location.hostname || "localhost";
  // Reuse same port if page served on a non-standard port, else default ROS bridge port 9090
  const pagePort = window.location.port ? `:${window.location.port}` : "";
  const defaultPort = ":9090";
  // If page has an explicit port, prefer that; otherwise use 9090
  const port = pagePort || defaultPort;
  return `${wsScheme}://${host}${port}`;
}

// Optional override via query param: ?rosbridge=... (supports full ws:// or host[:port])
function getQueryOverride(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("rosbridge");
    if (!raw) return null;

    // If user provided full ws(s) URL, use as-is
    if (/^wss?:\/\//i.test(raw)) return raw;

    // If user provided host or host:port, add scheme based on page protocol
    const isSecure = window.location.protocol === "https:";
    const wsScheme = isSecure ? "wss" : "ws";
    // If port missing, default to 9090
    const hasPort = /:\d+$/.test(raw);
    const hostPort = hasPort ? raw : `${raw}:9090`;
    return `${wsScheme}://${hostPort}`;
  } catch {
    return null;
  }
}

const queryUrl = typeof window !== "undefined" ? getQueryOverride() : null;
const defaultUrl = queryUrl || envUrl || buildDynamicUrl();
let ros: ROSLIB.Ros | null = null;
let currentUrl = defaultUrl;

export function getRos(): ROSLIB.Ros {
  if (!ros) {
    ros = new ROSLIB.Ros({ url: currentUrl });
    console.log("Connecting to ROS at", currentUrl);
  }
  return ros;
}

export function setRosUrl(url: string) {
  currentUrl = url;
  if (ros) {
    try { (ros as any).close && (ros as any).close(); } catch {}
  }
  ros = new ROSLIB.Ros({ url });
}
