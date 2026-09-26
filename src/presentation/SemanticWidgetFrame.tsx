import React, { useMemo } from "react";
import { ReactResolvedWidget } from "@ggcs/renderer-react";
import { createStandardReactWidgetRegistry } from "@ggcs/widgets-react";
import type { ResolvedWidgetInstance } from "@ggcs/widgets";
import { useRuntimeCompatibility } from "../runtime/compatibility-context";
import { createSensorSuiteSemanticPresentationAccess } from "./semantic-widget-cutover";

const registry = createStandardReactWidgetRegistry();

export function SemanticWidgetFrame(props: {
  readonly instance: ResolvedWidgetInstance;
}) {
  const compatibility = useRuntimeCompatibility();
  const presentationAccess = useMemo(
    () => createSensorSuiteSemanticPresentationAccess(compatibility),
    [compatibility],
  );
  const access = presentationAccess.widget(props.instance.id);
  if (!access) {
    throw new Error(`Semantic presentation access is missing widget ${props.instance.id}`);
  }

  return (
    <ReactResolvedWidget
      instance={props.instance}
      access={access}
      registry={registry}
    />
  );
}
