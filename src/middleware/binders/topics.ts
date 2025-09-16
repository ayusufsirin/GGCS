// middleware/topics.ts
import { collectTopicBindings, type TopicBinding } from "../config-scan";
import { sharedTopics } from "../roslib/shared-topic";
import { instanceStore } from "../instance-store";

function getByPath(obj: any, dotPath: string) {
  const parts = dotPath.replace(/^\./, "").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function attachTopicBindings(bindings?: TopicBinding[]) {
  const list = bindings ?? collectTopicBindings((globalThis as any).config);
  const byTopic = new Map<string, TopicBinding[]>();

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
