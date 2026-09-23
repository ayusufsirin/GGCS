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

const serviceBindings = [
  {
    instanceId: "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStopRecord",
    attrName: "callService",
    service: { name: "/legacy-bag-stop", type: "std_srvs/srv/Trigger" },
  },
  {
    instanceId: "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.bagStartRecord",
    attrName: "callService",
    service: { name: "/legacy-bag-start", type: "std_srvs/srv/Trigger" },
  },
  {
    instanceId: "tabs.items.home.grids.items.panel.tabs.items.actions.grids.items.zedStopSvo",
    attrName: "callService",
    service: { name: "/legacy-zed-stop", type: "std_srvs/srv/Trigger" },
  },
  {
    instanceId: "tabs.items.rosParameters",
    attrName: "listNodes",
    service: { name: "/rosapi/nodes", type: "rosapi/Nodes" },
  },
];


beforeEach(() => {
  jest.clearAllMocks();
  (collectSubscriberBindings as jest.Mock).mockReturnValue(subscriberBindings);
  (collectServiceBindings as jest.Mock).mockReturnValue(serviceBindings);
  (collectConstantBindings as jest.Mock).mockReturnValue(["constant"]);
  (collectPublisherBindings as jest.Mock).mockReturnValue(["publisher"]);
  (attachSubscriberBindings as jest.Mock).mockReturnValue(jest.fn());
  (attachServiceBindings as jest.Mock).mockReturnValue(jest.fn());
  (attachConstantBindings as jest.Mock).mockReturnValue(jest.fn());
  (attachPublisherBindings as jest.Mock).mockReturnValue(jest.fn());
});

describe("M04-S6 legacy binding attachment", () => {
  test("compat-read removes migrated telemetry, recording Procedures, and parameter services while keeping camera", () => {
    attachAllBindingsForMode({}, "compat-read");

    expect(attachSubscriberBindings).toHaveBeenCalledWith([subscriberBindings[1]]);
    expect(attachServiceBindings).toHaveBeenCalledWith([]);
    expect(attachConstantBindings).toHaveBeenCalledWith(["constant"]);
    expect(attachPublisherBindings).toHaveBeenCalledWith(["publisher"]);
  });

  test("compat-full does not collect or attach any legacy bindings", () => {
    attachAllBindingsForMode({}, "compat-full");

    expect(collectSubscriberBindings).not.toHaveBeenCalled();
    expect(collectServiceBindings).not.toHaveBeenCalled();
    expect(collectConstantBindings).not.toHaveBeenCalled();
    expect(collectPublisherBindings).not.toHaveBeenCalled();
    expect(attachSubscriberBindings).not.toHaveBeenCalled();
    expect(attachServiceBindings).not.toHaveBeenCalled();
    expect(attachConstantBindings).not.toHaveBeenCalled();
    expect(attachPublisherBindings).not.toHaveBeenCalled();
  });

  test("legacy mode keeps complete subscriber and service sets for restart-based rollback", () => {
    attachAllBindingsForMode({}, "legacy");
    expect(attachSubscriberBindings).toHaveBeenCalledWith(subscriberBindings);
    expect(attachServiceBindings).toHaveBeenCalledWith(serviceBindings);
  });
});
