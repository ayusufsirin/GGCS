import { attachSubscriberBindings, collectSubscriberBindings } from "./binders/subscribers";
import { attachServiceBindings, collectServiceBindings } from "./binders/services";
import { attachConstantBindings, collectConstantBindings } from "./binders/constants";
import { attachPublisherBindings, collectPublisherBindings } from "./binders/publishers";
import { useEffect } from "react";
import { useRuntimeCompatibility } from "../runtime/compatibility-context";
import type { SensorSuiteBackendMode } from "../runtime/backend-mode";
import { filterLegacySubscriberBindingsForMode } from "../runtime/telemetry-cutover";
import { filterLegacyServiceBindingsForMode } from "../runtime/action-cutover";
import { filterLegacyParameterServiceBindingsForMode } from "../runtime/parameter-cutover";

export function attachAllBindingsForMode(config: unknown, mode: SensorSuiteBackendMode) {
  const topics = filterLegacySubscriberBindingsForMode(mode, collectSubscriberBindings(config));
  const actionFilteredServices = filterLegacyServiceBindingsForMode(mode, collectServiceBindings(config));
  const services = filterLegacyParameterServiceBindingsForMode(mode, actionFilteredServices);
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
  const { mode } = useRuntimeCompatibility();

  useEffect(() => {
    const off = attachAllBindingsForMode(config, mode);
    return () => off();
  }, [config, mode]);
}
