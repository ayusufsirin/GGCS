// binder.ts
import { InstanceBinding } from "./config-scan";
import { sharedTopics } from "./roslib/ros-shared";
import { instanceStore } from "./instance-store";

function getByPath(obj: any, dotPath: string) {
  const parts = dotPath.replace(/^\./, "").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function attachBindings(bindings: InstanceBinding[]) {
  // group by topic to minimize callbacks
  const byTopic = new Map<string, InstanceBinding[]>();
  for (const b of bindings) {
    const k = `${b.topic.name}|${b.topic.type}`;
    const arr = byTopic.get(k) ?? [];
    arr.push(b);
    byTopic.set(k, arr);
  }

  const offs: Array<() => void> = [];

  byTopic.forEach((arr /* InstanceBinding[] */, _key) => {
    // console.debug("attachBindings", arr, arr.length);
    if (arr.length === 0) return;
    const t = arr[0].topic;
    // console.debug("attachBindings", t);
    const off = sharedTopics.addListener(t, (msg) => {
      arr.forEach((b) => {
        const val = getByPath(msg, b.topicField);
        // console.debug("attachBindings", val);
        instanceStore.emit(b.instanceId, b.attrName, val);
      });
    });
    // console.debug("attachBindings", off);
    offs.push(off);
    // console.debug("attachBindings", offs);
  });

  // detach function
  return () => offs.forEach((f) => f());
}
