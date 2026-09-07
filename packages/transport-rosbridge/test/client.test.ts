import { describe, expect, it } from "vitest";
import { defaultRosbridgeClientFactory } from "../src/index.js";

describe("ROSLIB transport adapter", () => {
  it("can subscribe while GGCS owns reconnect lifecycle", () => {
    const client = defaultRosbridgeClientFactory.create();
    const topic = client.createTopic({
      topic: "/ggcs_test/temperature",
      messageType: "std_msgs/msg/Float64",
    });
    const listener = (): void => undefined;

    // Regression for ROSLIB 1.4.1: reconnect_on_close=false installs an
    // unbound Ros.callOnConnection function unless the GGCS adapter rebinds
    // it. This must work without a live socket; ROSLIB queues the operation.
    expect(() => topic.subscribe(listener)).not.toThrow();
    expect(() => topic.unsubscribe(listener)).not.toThrow();
  });
});
