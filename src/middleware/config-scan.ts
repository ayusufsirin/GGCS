// middleware/config-scan.ts
// TODO: Refactor this code to be more generic
import type { Service, Topic } from "../interfaces";

export type TopicBinding = {
  instanceId: string;   // unique path to this widget instance
  attrName: string;     // e.g. "speed" | "latitude"
  topic: Topic;       // { name, type }
  topicField: string;   // e.g. ".data" or ".latitude"
};


export type ServiceBinding = {
  instanceId: string;   // widget instance path
  attrName: string;     // attribute name the widget will call (e.g., "reset")
  service: Service;   // { name, type }
};

function makeInstanceId(path: string[]) {
  return path.join(".");
}

export function collectTopicBindings(config: unknown): TopicBinding[] {
  const out: TopicBinding[] = [];

  function walk(node: any, path: string[] = []) {
    if (!node || typeof node !== "object") return;

    if (node.widget && typeof node.widget === "object") {
      const instanceId = makeInstanceId(path);
      const cfg = (node.widget.config ?? {}) as Record<string, any>;
      for (const [attrName, v] of Object.entries(cfg)) {
        if (v && typeof v === "object" && v.type === "topic" && v.topic && v.topicField) {
          const t = v.topic as Topic;
          out.push({
            instanceId,
            attrName,
            topic: t,
            topicField: String(v.topicField),
          });
        }
      }
    }

    for (const [k, v] of Object.entries(node)) {
      if (k === "widget") continue;
      if (v && typeof v === "object") walk(v, [...path, k]);
    }
  }

  walk(config as any, []);
  return out;
}

export function collectServiceBindings(config: unknown): ServiceBinding[] {
  const out: ServiceBinding[] = [];

  function walk(node: any, path: string[] = []) {
    if (!node || typeof node !== "object") return;

    if (node.widget && typeof node.widget === "object") {
      const instanceId = makeInstanceId(path);
      const cfg = (node.widget.config ?? {}) as Record<string, any>;
      for (const [attrName, v] of Object.entries(cfg)) {
        if (v && typeof v === "object" && v.type === "service" && v.service) {
          const s = v.service as Service;
          out.push({
            instanceId,
            attrName,
            service: s
          });
        }
      }
    }

    for (const [k, v] of Object.entries(node)) {
      if (k === "widget") continue;
      if (v && typeof v === "object") walk(v, [...path, k]);
    }
  }

  walk(config as any, []);
  return out;
}
