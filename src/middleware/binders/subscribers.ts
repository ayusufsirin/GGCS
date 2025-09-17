import { collectBindings, isObject } from "../config-scan";
import { sharedTopics } from "../roslib/shared-topic";
import { instanceStore } from "../instance-store";
import { Topic, ValueTypes } from "../../interfaces";

export type SubscriberBinding = {
  instanceId: string; // unique path to this widget instance
  attrName: string;   // e.g. "speed" | "latitude"
  topic: Topic;       // { name, type }
  topicField: string; // e.g. ".data" or ".latitude"
};

function getByPath(obj: any, dotPath: string) {
  const parts = dotPath.replace(/^\./, "").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function attachSubscriberBindings(bindings?: SubscriberBinding[]) {
  const list = bindings ?? collectSubscriberBindings((globalThis as any).config);
  const byTopic = new Map<string, SubscriberBinding[]>();

  for (const b of list) {
    const k = `${b.topic.name}|${b.topic.type}`;
    const arr = byTopic.get(k) ?? [];
    arr.push(b);
    byTopic.set(k, arr);
  }

  const offs: Array<() => void> = [];

  byTopic.forEach((arr) => {
    if (arr.length === 0) return;
    const t = arr[0].topic;
    const off = sharedTopics.addListener(t, (msg) => {
      arr.forEach((b) => {
        const val = getByPath(msg, b.topicField);
        instanceStore.emit(b.instanceId, b.attrName, val);
      });
    });
    offs.push(off);
  });

  return () => offs.forEach((f) => f());
}

export function collectSubscriberBindings(config: unknown): SubscriberBinding[] {
  return collectBindings<SubscriberBinding>(
    config,
    // match
    (e) => e.type === ValueTypes.subscriber && isObject(e.topic) && typeof e.topicField === "string",
    // map
    ({ instanceId, attrName, entry }) => {
      const topic = entry.topic as Topic;
      const topicField = String(entry.topicField);
      return { instanceId, attrName, topic, topicField };
    }
  );
}
