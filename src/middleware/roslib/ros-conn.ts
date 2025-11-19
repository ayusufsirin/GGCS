// ros-conn.ts
import ROSLIB from "roslib";

// Read from environment variable if available, otherwise fallback
const defaultUrl = process.env.REACT_APP_GGCS_ROSBRIDGE_URL || "ws://localhost:9090";

let ros: ROSLIB.Ros | null = null;
let currentUrl = defaultUrl;

export function getRos(): ROSLIB.Ros {
  if (!ros) ros = new ROSLIB.Ros({ url: currentUrl });
  return ros;
}

export function setRosUrl(url: string) {
  currentUrl = url;
  if (ros) {
    try { (ros as any).close && (ros as any).close(); } catch {}
  }
  ros = new ROSLIB.Ros({ url });
}
