// middleware/roslib/shared-topic.ts
import ROSLIB from "roslib";
import { getRos } from "./ros-conn";
export type TopicId = { name: string; type: string };
type Listener = (msg: any) => void;

const tkey = (t: TopicId) => `${t.name}|${t.type}`;

class SharedTopicRegistry {
  private ros: ROSLIB.Ros;
  private entries = new Map<string, { topic: ROSLIB.Topic; cbs: Set<Listener>; handler: (m:any)=>void }>();

  constructor() {
    this.ros = getRos();
  }

  addListener(t: TopicId, cb: Listener) {
    const k = tkey(t);
    let e = this.entries.get(k);
    if (!e) {
      const topic = new ROSLIB.Topic({ ros: this.ros, name: t.name, messageType: t.type });
      const cbs = new Set<Listener>();
      const handler = (msg: any) => { for (const fn of Array.from(cbs)) fn(msg); };
      topic.subscribe(handler);
      e = { topic, cbs, handler };
      this.entries.set(k, e);
    }
    e.cbs.add(cb);

    // return unregister (now safe)
    return () => {
      const e2 = this.entries.get(k);
      if (!e2) return;
      e2.cbs.delete(cb);
      if (e2.cbs.size === 0) {
        try { e2.topic.unsubscribe(e2.handler); } catch {}
        this.entries.delete(k);
      }
    };
  }
}

export const sharedTopics = new SharedTopicRegistry();
