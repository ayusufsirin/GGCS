jest.mock("./binders/subscribers", () => ({
  collectSubscriberBindings: jest.fn(),
  attachSubscriberBindings: jest.fn(() => jest.fn()),
}));
jest.mock("./binders/services", () => ({
  collectServiceBindings: jest.fn(),
  attachServiceBindings: jest.fn(() => jest.fn()),
}));
jest.mock("./binders/constants", () => ({
  collectConstantBindings: jest.fn(),
  attachConstantBindings: jest.fn(() => jest.fn()),
}));
jest.mock("./binders/publishers", () => ({
  collectPublisherBindings: jest.fn(),
  attachPublisherBindings: jest.fn(() => jest.fn()),
}));

import {
  attachSubscriberBindings,
  collectSubscriberBindings,
} from "./binders/subscribers";
import { attachServiceBindings, collectServiceBindings } from "./binders/services";
import { attachConstantBindings, collectConstantBindings } from "./binders/constants";
import { attachPublisherBindings, collectPublisherBindings } from "./binders/publishers";
import { attachAllBindingsForMode } from "./attach-bindings";

const subscriberBindings = [
  {
    instanceId: "tabs.items.home.grids.items.hud",
    attrName: "roll",
    topic: { name: "/legacy-nav", type: "example/Nav" },
    topicField: ".roll",
  },
  {
    instanceId: "tabs.items.images.grids.items.zedRgb",
    attrName: "image",
    topic: { name: "/legacy-camera", type: "example/Image" },
    topicField: ".data",
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  (collectSubscriberBindings as jest.Mock).mockReturnValue(subscriberBindings);
  (collectServiceBindings as jest.Mock).mockReturnValue(["service"]);
  (collectConstantBindings as jest.Mock).mockReturnValue(["constant"]);
  (collectPublisherBindings as jest.Mock).mockReturnValue(["publisher"]);
  (attachSubscriberBindings as jest.Mock).mockReturnValue(jest.fn());
  (attachServiceBindings as jest.Mock).mockReturnValue(jest.fn());
  (attachConstantBindings as jest.Mock).mockReturnValue(jest.fn());
  (attachPublisherBindings as jest.Mock).mockReturnValue(jest.fn());
});

describe("M04-S3 legacy binding attachment", () => {
  test("compat-read removes Runtime-migrated telemetry but keeps the camera exception and action paths", () => {
    attachAllBindingsForMode({}, "compat-read");

    expect(attachSubscriberBindings).toHaveBeenCalledWith([subscriberBindings[1]]);
    expect(attachServiceBindings).toHaveBeenCalledWith(["service"]);
    expect(attachConstantBindings).toHaveBeenCalledWith(["constant"]);
    expect(attachPublisherBindings).toHaveBeenCalledWith(["publisher"]);
  });

  test("legacy mode keeps the complete subscriber set for restart-based rollback", () => {
    attachAllBindingsForMode({}, "legacy");
    expect(attachSubscriberBindings).toHaveBeenCalledWith(subscriberBindings);
  });
});
