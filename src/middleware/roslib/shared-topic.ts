// middleware/roslib/shared-topic.ts
import ROSLIB from "roslib";
import { getRos } from "./ros-conn";

export type TopicId = { name: string; type: string };
type Listener = (msg: any) => void;

const tkey = (t: TopicId) => `${t.name}|${t.type}`;

class SharedTopicRegistry {
  private ros: ROSLIB.Ros;
  private entries = new Map<string, {
    topic: ROSLIB.Topic;
    cbs: Set<Listener>;
    handler?: (m: any) => void;
    advertised: boolean;
    pubRefs: number
  }>();

  constructor() {
    this.ros = getRos();
  }

  addListener(t: TopicId, cb: Listener) {
    const k = tkey(t);
    let e = this.entries.get(k);
    if (!e) {
      const topic = new ROSLIB.Topic({ ros: this.ros, name: t.name, messageType: t.type });
      const cbs = new Set<Listener>();
      const handler = (msg: any) => {
        for (const fn of Array.from(cbs)) fn(msg);
      };
      topic.subscribe(handler);
      e = { topic, cbs, handler, advertised: false, pubRefs: 0 };
      this.entries.set(k, e);
    }
    e.cbs.add(cb);

    // return unregister (now safe)
    return () => {
      const e2 = this.entries.get(k);
      if (!e2) return;
      e2.cbs.delete(cb);
      if (e2.cbs.size === 0 && e2.pubRefs === 0) {
        try {
          if (e2.handler) e2.topic.unsubscribe(e2.handler);
        } catch {
        }
        try {
          if (e2.advertised) e2.topic.unadvertise();
        } catch {
        }
        this.entries.delete(k);
      }
    };
  }

  // Get a persistent publisher for repeated publishes. Keeps the topic advertised
  // until dispose() is called.
  getPublisher(t: TopicId) {
    const k = tkey(t);
    let e = this.entries.get(k);
    if (!e) {
      const topic = new ROSLIB.Topic({ ros: this.ros, name: t.name, messageType: t.type });
      e = { topic, cbs: new Set<Listener>(), handler: undefined, advertised: false, pubRefs: 0 };
      this.entries.set(k, e);
    }
    if (!e.advertised) {
      try {
        e.topic.advertise();
        e.advertised = true;
      } catch {
      }
    }
    e.pubRefs++;

    const publish = (msg: any) => {
      try {
        e!.topic.publish(msg);
      } catch {
      }
    };

    const dispose = () => {
      const e2 = this.entries.get(k);
      if (!e2) return;
      e2.pubRefs = Math.max(0, e2.pubRefs - 1);
      if (e2.cbs.size === 0 && e2.pubRefs === 0) {
        try {
          if (e2.advertised) e2.topic.unadvertise();
        } catch {
        }
        this.entries.delete(k);
      }
    };

    return { publish, dispose };
  }
}

export const sharedTopics = new SharedTopicRegistry();
