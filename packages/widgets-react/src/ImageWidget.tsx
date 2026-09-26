import React from "react";
import { useWidgetInputObservation, useWidgetProps } from "@ggcs/renderer-react";
import type { ImageFrame } from "@ggcs/widgets";
import { displayObservation } from "./observation.js";

interface ImageProps extends Readonly<Record<string, unknown>> {
  readonly label?: string;
}

export function imageFrameSource(frame: ImageFrame): string | undefined {
  if (frame.encoding === "base64") {
    return `data:${frame.mimeType};base64,${frame.payload}`;
  }
  if (frame.encoding === "uri") return frame.payload;
  return undefined;
}

export function ImageWidget() {
  const props = useWidgetProps() as unknown as ImageProps;
  const observation = useWidgetInputObservation<ImageFrame>("frame");
  const display = displayObservation(observation);
  const src = display.value ? imageFrameSource(display.value) : undefined;

  return (
    <div
      data-ggcs-widget="image"
      data-observation-state={display.state}
    >
      {props.label ? <div>{props.label}</div> : null}
      {src ? (
        <img
          id="cam"
          style={{ width: "500px", maxWidth: "100%" }}
          alt={props.label ?? "Camera frame"}
          src={src}
        />
      ) : (
        <div role="status">
          {display.value?.encoding === "opaque-reference" ? "Image reference unavailable in Web renderer" : display.label}
        </div>
      )}
      {display.state !== "fresh" && src ? <div role="status">{display.label}</div> : null}
    </div>
  );
}
