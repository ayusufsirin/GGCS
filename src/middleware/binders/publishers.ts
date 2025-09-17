// src/middleware/binders/publishers.ts
import { collectBindings, isObject } from "../config-scan";
import { Topic, ValueTypes } from "../../interfaces";
import { sharedTopics } from "../roslib/shared-topic";
import { publisherBus } from "../publisher-bus";

export type PublisherBinding = {
  instanceId: string;
  attrName: string;
  topic: Topic;
};

export function collectPublisherBindings(config: unknown): PublisherBinding[] {
  return collectBindings<PublisherBinding>(
    config,
    (e) => e.type === ValueTypes.publisher && isObject(e.topic),
    ({ instanceId, attrName, entry }) => {
      const topic = entry.topic as Topic;
      return { instanceId, attrName, topic };
    }
  );
}

export function attachPublisherBindings(bindings?: PublisherBinding[]) {
  const list = bindings ?? collectPublisherBindings((globalThis as any).config);

  const disposers: Array<() => void> = [];

  for (const b of list) {
    console.log("attachPublisherBindings", b);
    const pub = sharedTopics.getPublisher({ name: b.topic.name, type: b.topic.type });
    const unregister = publisherBus.register(b.instanceId, b.attrName, (msg: any) => {
      try {
        pub.publish(msg);
      } catch {
      }
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
