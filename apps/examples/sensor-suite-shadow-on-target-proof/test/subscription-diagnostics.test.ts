import { describe, expect, it } from "vitest";
import type {
  RosbridgeClient,
  RosbridgeClientFactory,
  RosbridgeTopic,
  RosbridgeTopicListener,
  RosbridgeTopicOptions,
} from "@ggcs/transport-rosbridge";
import {
  SubscriptionDiagnostics,
  assertSinglePhysicalSubscriptions,
  createDiagnosticClientFactory,
} from "../src/subscription-diagnostics.js";

class FakeTopic implements RosbridgeTopic {
  subscribe(_listener: RosbridgeTopicListener): void {}
  unsubscribe(_listener: RosbridgeTopicListener): void {}
  advertise(): void {}
  unadvertise(): void {}
  publish(_message: unknown): void {}
}

it("records active/max physical subscriptions without changing the client contract", () => {
  const delegate: RosbridgeClientFactory = {
    create(): RosbridgeClient {
      return {
        isConnected: true,
        on() {}, connect() {}, close() {},
        createTopic(_options: RosbridgeTopicOptions) { return new FakeTopic(); },
        createService() { throw new Error("not used"); },
      };
    },
  };
  const diagnostics = new SubscriptionDiagnostics();
  const client = createDiagnosticClientFactory(diagnostics, delegate).create();
  const topic = client.createTopic({ topic: "/speed", messageType: "std_msgs/msg/Float64" });
  const listener = () => undefined;
  topic.subscribe(listener);
  expect(diagnostics.snapshot()["/speed"]).toMatchObject({
    createTopicCalls: 1,
    subscribeCalls: 1,
    activeSubscriptions: 1,
    maxActiveSubscriptions: 1,
  });
  topic.unsubscribe(listener);
  expect(diagnostics.snapshot()["/speed"]).toMatchObject({
    unsubscribeCalls: 1,
    activeSubscriptions: 0,
    maxActiveSubscriptions: 1,
  });
});


it("requires only the physical topics explicitly selected by the proof mode", () => {
  const diagnostics = new SubscriptionDiagnostics();
  for (const topic of ["/ArdicLabs/Arnav/Gnss_Ins_data", "/speed", "/accel", "/arnav/satellites"]) {
    diagnostics.recordSubscribe(topic);
  }
  const snapshot = diagnostics.snapshot();
  expect(() => assertSinglePhysicalSubscriptions(snapshot, [
    "/ArdicLabs/Arnav/Gnss_Ins_data",
    "/speed",
    "/accel",
    "/arnav/satellites",
  ])).not.toThrow();
  expect(() => assertSinglePhysicalSubscriptions(snapshot, [
    "/ArdicLabs/Arnav/Gnss_Ins_data",
    "/speed",
    "/accel",
    "/arnav/satellites",
    "/zed/zed_node/rgb/color/rect/image/compressed",
  ])).toThrow(/No GGCS subscription diagnostic/);
});
