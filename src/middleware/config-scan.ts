// middleware/config-scan.ts
import type { Service, Topic } from "../interfaces";

export type TopicBinding = {
  instanceId: string; // unique path to this widget instance
  attrName: string;   // e.g. "speed" | "latitude"
  topic: Topic;       // { name, type }
  topicField: string; // e.g. ".data" or ".latitude"
};

export type ServiceBinding = {
  instanceId: string; // widget instance path
  attrName: string;   // attribute name the widget will call (e.g., "reset")
  service: Service;   // { name, type }
};

export type ConstantBinding = {
  instanceId: string; // widget instance path
  attrName: string;   // attribute name (e.g., "title")
  value: unknown;     // literal value taken from config
};

// ---------- utils ----------
function makeInstanceId(path: string[]) {
  return path.join(".");
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function isWidgetNode(node: unknown): node is { widget: { config?: Record<string, unknown> } } {
  return (
    isObject(node) &&
    "widget" in node &&
    isObject((node as any).widget)
  );
}

// Walk any nested object/array, but don't dive into `widget` itself.
// (We only inspect widget.config at the node level.)
function walkTree(root: unknown, visit: (node: Record<string, unknown>, path: string[]) => void, path: string[] = []) {
  if (!isObject(root)) return;

  // Let the visitor do its thing for this node
  visit(root, path);

  // Recurse children, skipping the "widget" branch (handled by visitor)
  for (const [k, v] of Object.entries(root)) {
    if (k === "widget") continue;
    if (isObject(v)) {
      walkTree(v, visit, [...path, k]);
    } else if (Array.isArray(v)) {
      v.forEach((item, idx) => {
        if (isObject(item)) walkTree(item, visit, [...path, `${k}[${idx}]`]);
      });
    }
  }
}

// ---------- generic collector ----------
type ConfigEntry = { type?: string; [k: string]: unknown };

export function collectBindings<TBinding>(
  config: unknown,
  isMatch: (entry: ConfigEntry) => boolean,
  toBinding: (args: {
    instanceId: string;
    attrName: string;
    entry: ConfigEntry;
  }) => TBinding | null
): TBinding[] {
  const out: TBinding[] = [];

  walkTree(config, (node, path) => {
    if (!isWidgetNode(node)) return;

    const instanceId = makeInstanceId(path);
    const cfg = (node.widget.config ?? {}) as Record<string, unknown>;

    for (const [attrName, raw] of Object.entries(cfg)) {
      if (!isObject(raw)) continue;
      const entry = raw as ConfigEntry;
      if (!isMatch(entry)) continue;

      const binding = toBinding({instanceId, attrName, entry});
      if (binding) out.push(binding);
    }
  });

  return out;
}

// ---------- specializations ----------
export function collectTopicBindings(config: unknown): TopicBinding[] {
  return collectBindings<TopicBinding>(
    config,
    // match
    (e) => e.type === "topic" && isObject(e.topic) && typeof e.topicField === "string",
    // map
    ({instanceId, attrName, entry}) => {
      const topic = entry.topic as Topic;
      const topicField = String(entry.topicField);
      return {instanceId, attrName, topic, topicField};
    }
  );
}

export function collectServiceBindings(config: unknown): ServiceBinding[] {
  return collectBindings<ServiceBinding>(
    config,
    // match
    (e) => e.type === "service" && isObject(e.service),
    // map
    ({instanceId, attrName, entry}) => {
      const service = entry.service as Service;
      return {instanceId, attrName, service};
    }
  );
}

export function collectConstantBindings(config: unknown): ConstantBinding[] {
  return collectBindings<ConstantBinding>(
    config,
    // match
    (e) => e.type === "constant" && "constant" in e,
    // map
    ({instanceId, attrName, entry}) => {
      return { instanceId, attrName, value: (entry as any).constant };
    }
  );
}
