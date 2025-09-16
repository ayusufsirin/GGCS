import { attachTopicBindings, collectTopicBindings } from "./binders/topics";
import { attachServiceBindings, collectServiceBindings } from "./binders/services";
import { attachConstantBindings, collectConstantBindings } from "./binders/constants";
import { useEffect } from "react";

function attachAllBindings(config: unknown) {
  const topics = collectTopicBindings(config);
  const services = collectServiceBindings(config);
  const constants = collectConstantBindings(config);

  const offTopics = attachTopicBindings(topics);
  const offServices = attachServiceBindings(services);
  const offConstants = attachConstantBindings(constants);

  return () => {
    offTopics();
    offServices();
    offConstants();
  };
}

export function useAttachAllBindings(config: unknown) {
  useEffect(() => {
    const off = attachAllBindings(config);
    return () => off();
  }, [config]);
}
