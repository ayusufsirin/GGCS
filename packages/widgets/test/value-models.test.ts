import { describe, expect, it } from "vitest";
import { WIDGET_TYPE_DESCRIPTORS, WIDGET_TYPE_IDS } from "../src/index.js";

describe("widget semantic value models", () => {
  it("uses stable namespaced descriptor IDs", () => {
    for (const [name, descriptor] of Object.entries(WIDGET_TYPE_DESCRIPTORS)) {
      expect(descriptor.id, name).toBe(WIDGET_TYPE_IDS[name as keyof typeof WIDGET_TYPE_IDS]);
      expect(descriptor.id).toMatch(/^ggcs:type\//);
      expect((descriptor.schema as any).$id).toBe(descriptor.id);
    }
  });

  it("keeps ImageFrame encoding explicit and renderer-neutral", () => {
    const schema = WIDGET_TYPE_DESCRIPTORS.imageFrame.schema as any;
    expect(schema.required).toEqual(["payload", "mimeType", "encoding"]);
    expect(schema.properties.encoding.enum).toEqual(["base64", "uri", "opaque-reference"]);
    expect(JSON.stringify(schema)).not.toContain("data:image/png");
  });
});
