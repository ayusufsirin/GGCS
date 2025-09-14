// config-scan.ts
export type TopicId = { name: string; type: string };
export type InstanceBinding = {
  instanceId: string;    // unique path to this widget instance
  attrName: string;      // e.g. "speed" | "latitude"
  topic: TopicId;        // {name, type}
  topicField: string;    // e.g. ".data" or ".latitude"
};

const SEP = ".";

function makeInstanceId(path: string[]) {
  // path like ["tabs","items","home","grids","items","hud"]
  return path.join(SEP);
}

export function collectInstanceBindings(config: unknown): InstanceBinding[] {
  const out: InstanceBinding[] = [];

  function walk(node: any, path: string[] = []) {
    if (!node || typeof node !== "object") return;

    // If this looks like a widget, scan its config
    if (node.widget && typeof node.widget === "object") {
      const instanceId = makeInstanceId(path);
      const cfg = (node.widget.config ?? {}) as Record<string, any>;
      for (const [attrName, v] of Object.entries(cfg)) {
        if (v && typeof v === "object" && v.type === "topic" && v.topic && v.topicField) {
          const t = v.topic as TopicId;
          if (typeof t.name === "string" && typeof t.type === "string") {
            out.push({
              instanceId,
              attrName,
              topic: t,
              topicField: String(v.topicField),
            });
          }
        }
      }
    }

    // Recurse
    for (const [k, v] of Object.entries(node)) {
      if (k === "widget") continue;
      if (v && typeof v === "object") walk(v, [...path, k]);
    }
  }

  walk(config as any, []);
  return out;
}
