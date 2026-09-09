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

  it("can advertise and publish while GGCS owns reconnect lifecycle", () => {
    const client = defaultRosbridgeClientFactory.create();
    const topic = client.createTopic({
      topic: "/ggcs_test/command",
      messageType: "std_msgs/msg/Float64",
      queueSize: 1,
      latch: false,
    });

    // The same ROSLIB 1.4.1 callForSubscribeAndAdvertise binding path is used
    // for publisher advertise operations. The adapter must keep it usable
    // while ROSLIB reconnect_on_close remains disabled.
    expect(() => topic.advertise()).not.toThrow();
    expect(() => topic.publish({ data: 42 })).not.toThrow();
    expect(() => topic.unadvertise()).not.toThrow();
  });
  it("can issue a service call through the ROSLIB adapter", () => {
    const client = defaultRosbridgeClientFactory.create();
    const service = client.createService({
      service: "/ggcs_test/trigger",
      serviceType: "std_srvs/srv/Trigger",
    });

    // ROSLIB queues call_service frames while the socket is not connected.
    // This adapter-level regression verifies raw request construction and the
    // pinned @types/roslib callService signature without external networking.
    expect(() =>
      service.call(
        {},
        () => undefined,
        () => undefined,
      ),
    ).not.toThrow();
  });

});
