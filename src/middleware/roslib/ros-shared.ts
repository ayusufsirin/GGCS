// ros-shared.ts
import ROSLIB from "roslib";
export type TopicId = { name: string; type: string };
type Listener = (msg: any) => void;

const tkey = (t: TopicId) => `${t.name}|${t.type}`;

class SharedTopicRegistry {
  private ros: ROSLIB.Ros;
  private entries = new Map<string, { topic: ROSLIB.Topic; cbs: Set<Listener> }>();

  // TODO: Make ROS URL parametric
  constructor(rosUrl = "ws://localhost:9090") {
    this.ros = new ROSLIB.Ros({ url: rosUrl });
  }

  addListener(t: TopicId, cb: Listener) {
    console.debug("addListener", t);
    const k = tkey(t);
    // console.debug("addListener", k, typeof k);
    let e = this.entries.get(k);
    // console.debug("addListener",this.entries);
    // console.debug("addListener",e);
    if (!e) {
      // console.debug("addListener", "generate subscription");
      const topic = new ROSLIB.Topic({
        ros: this.ros,
        name: t.name,
        messageType: t.type,
      });
      const cbs = new Set<Listener>();
      topic.subscribe((msg) => {
        for (const fn of Array.from(cbs)) fn(msg);
        // console.debug("subscribe", topic, msg);
      });
      e = { topic, cbs };
      this.entries.set(k, e);
      // console.debug("addListener", e);
    }
    e.cbs.add(cb);

    console.debug("ROS Topic Entries", this.entries);

    return () => {
      const e2 = this.entries.get(k);
      // console.debug("callback", e2);
      if (!e2) return;
      // TODO: Solve the unsubscribe problem
      // console.debug("callback", e2);
      // e2.cbs.delete(cb);
      // if (e2.cbs.size === 0) {
      //   console.debug("unsubscribe", e2.topic);
      //   e2.topic.unsubscribe();
      //   this.entries.delete(k);
      // }
    };
  }
}

export const sharedTopics = new SharedTopicRegistry();
