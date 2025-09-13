import { config } from "./config";
import {Topic} from "./interfaces"

/** Recursively find all { topic: { name, type } } pairs and return a Set of "name|type" keys */
function collectTopicKeySet(input: unknown, out = new Set<string>()): Set<string> {
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;

    // If this object has a "topic" key with {name,type}, record it
    if (obj.topic && typeof obj.topic === "object") {
      const t = obj.topic as Partial<Topic>;
      if (typeof t.name === "string" && typeof t.type === "string") {
        out.add(`${t.name}|${t.type}`);
      }
    }

    // Recurse into all nested values
    for (const v of Object.values(obj)) {
      collectTopicKeySet(v, out);
    }
  }
  return out;
}

/** Convenience: return a Set<Topic> (deduped by name|type) */
function collectTopicSet(input: unknown): Set<Topic> {
  const keys = collectTopicKeySet(input);
  const s = new Set<Topic>();
  for (const k of Array.from(keys)) {
    const [name, type] = k.split("|");
    s.add({ name, type });
  }
  return s;
}

// --- Usage ---
export const topicSet = collectTopicSet(config);
// topicSet contains:
// { name: "/gps",   type: "custom_msgs/msg/GPS" }
// { name: "/speed", type: "std_msgs/msg/Float64" }
// { name: "/accel", type: "std_msgs/msg/Float64" }

// If you prefer the raw Set of string keys:
export const topicKeySet = collectTopicKeySet(config);
// -> Set { "/gps|custom_msgs/msg/GPS", "/speed|std_msgs/msg/Float64", "/accel|std_msgs/msg/Float64" }

