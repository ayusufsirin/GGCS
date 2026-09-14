import {
  buildDynamicRosbridgeUrl,
  getRosbridgeQueryOverride,
  resolveRosbridgeUrl,
  type BrowserLocationLike,
} from "./rosbridge-url";

const location = (overrides: Partial<BrowserLocationLike> = {}): BrowserLocationLike => ({
  protocol: "http:",
  hostname: "dashboard.local",
  port: "",
  search: "",
  ...overrides,
});

describe("shared Web rosbridge URL resolution", () => {
  test("preserves the legacy dynamic URL behavior", () => {
    expect(buildDynamicRosbridgeUrl(location())).toBe("ws://dashboard.local:9090");
    expect(buildDynamicRosbridgeUrl(location({ protocol: "https:", port: "8443" }))).toBe(
      "wss://dashboard.local:8443",
    );
  });

  test("query override wins over environment configuration", () => {
    const loc = location({ search: "?rosbridge=robot.local:9191" });
    expect(getRosbridgeQueryOverride(loc)).toBe("ws://robot.local:9191");
    expect(resolveRosbridgeUrl({ envUrl: "ws://env.local:9090", location: loc })).toBe(
      "ws://robot.local:9191",
    );
  });

  test("full ws/wss query URLs are preserved", () => {
    expect(
      getRosbridgeQueryOverride(location({ protocol: "https:", search: "?rosbridge=wss%3A%2F%2Frobot.local%3A9443" })),
    ).toBe("wss://robot.local:9443");
  });

  test("environment override wins over dynamic fallback", () => {
    expect(resolveRosbridgeUrl({ envUrl: "ws://env.local:9090", location: location() })).toBe(
      "ws://env.local:9090",
    );
  });
});
