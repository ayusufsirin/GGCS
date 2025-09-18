import { attachSubscriberBindings, collectSubscriberBindings } from "./binders/subscribers";
import { attachServiceBindings, collectServiceBindings } from "./binders/services";
import { attachConstantBindings, collectConstantBindings } from "./binders/constants";
import { attachPublisherBindings, collectPublisherBindings } from "./binders/publishers";
import { useEffect } from "react";

function attachAllBindings(config: unknown) {
  const topics = collectSubscriberBindings(config);
  const services = collectServiceBindings(config);
  const constants = collectConstantBindings(config);
  const publishers = collectPublisherBindings(config);

  const offTopics = attachSubscriberBindings(topics);
  const offServices = attachServiceBindings(services);
  const offConstants = attachConstantBindings(constants);
  const offPublishers = attachPublisherBindings(publishers);

  return () => {
    offTopics();
    offServices();
    offConstants();
    offPublishers();
  };
}

export function useAttachAllBindings(config: unknown) {
  useEffect(() => {
    const off = attachAllBindings(config);
    return () => off();
  }, [config]);
}
