// ros-conn.ts
import ROSLIB from "roslib";
import { resolveRosbridgeUrl } from "../../runtime/rosbridge-url";

let ros: ROSLIB.Ros | null = null;
let currentUrl = resolveRosbridgeUrl({
  envUrl: process.env.REACT_APP_GGCS_ROSBRIDGE_URL,
});

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
