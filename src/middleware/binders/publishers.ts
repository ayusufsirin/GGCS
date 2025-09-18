// src/middleware/binders/publishers.ts
import { collectBindings, isObject } from "../config-scan";
import { Topic, ValueTypes } from "../../interfaces";
import { sharedTopics } from "../roslib/shared-topic";
import { publisherBus } from "../publisher-bus";

export type PublisherBinding = {
  instanceId: string;
  attrName: string;
  topic: Topic;
  topicField?: string;        // optional dot-path like ".data"
};

function setByPath(target: any, dotPath: string, value: any) {
  const parts = dotPath.replace(/^\./, "").split(".").filter(Boolean);
  let cur = target;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const isLast = i === parts.length - 1;
    if (isLast) {
      cur[p] = value;
    } else {
      cur[p] = cur[p] ?? {};
      cur = cur[p];
    }
  }
}

export function collectPublisherBindings(config: unknown): PublisherBinding[] {
  return collectBindings<PublisherBinding>(
    config,
    (e) => e.type === ValueTypes.publisher && isObject(e.topic),
    ({ instanceId, attrName, entry }) => {
      const topic = entry.topic as Topic;
      const topicField = typeof (entry as any).topicField === "string" ? String((entry as any).topicField) : undefined;
      return { instanceId, attrName, topic, topicField };
    }
  );
}

export function attachPublisherBindings(bindings?: PublisherBinding[]) {
  const list = bindings ?? collectPublisherBindings((globalThis as any).config);

  const disposers: Array<() => void> = [];

  for (const b of list) {
    const pub = sharedTopics.getPublisher({ name: b.topic.name, type: b.topic.type });

    // Expose function: accepts primitive or full message.
    const unregister = publisherBus.register(b.instanceId, b.attrName, (input: any) => {
      try {
        let msg: any = input;
        if (b.topicField) {
          if (input !== null && typeof input === "object") {
            // If field missing, set it with the whole input (common case: user passes primitive -> not here)
            const parts = b.topicField.replace(/^\./, "").split(".").filter(Boolean);
            let cur = msg, missing = false;
            for (let i = 0; i < parts.length; i++) {
              const p = parts[i];
              const isLast = i === parts.length - 1;
              if (!(p in cur)) {
                missing = true;
                if (!isLast) cur[p] = {};
              }
              if (isLast) break;
              cur = cur[p];
            }
            if (missing) setByPath(msg, b.topicField, input);
          } else {
            // Primitive or non-object: wrap into an object via topicField
            msg = {};
            setByPath(msg, b.topicField, input);
          }
        }
        pub.publish(msg);
      } catch {}
    });

    disposers.push(() => {
      unregister();
      pub.dispose();
    });
  }

  return () => {
    for (const d of disposers) d();
  };
}
