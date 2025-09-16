// ros-conn.ts
import ROSLIB from "roslib";

let ros: ROSLIB.Ros | null = null;
let currentUrl = "ws://localhost:9090";

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
