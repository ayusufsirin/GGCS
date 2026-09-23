import { useContext, useMemo } from "react";
import type { ParameterProvider } from "@ggcs/core";
import { Ctx } from "./common";
import { useRuntimeCompatibility } from "../../runtime/compatibility-context";

export interface ParameterBrowserAccess {
  listNodes(): Promise<readonly string[]>;
  listParameterIds(node?: string): Promise<readonly string[]>;
  read(id: string): Promise<string>;
  write(id: string, value: string): Promise<void>;
}

const PARAMETER_CAPABILITY = "parameters";

function nodeForParameterId(id: string): string | undefined {
  const separator = id.indexOf(":");
  return separator > 0 ? id.slice(0, separator) : undefined;
}

export function useParameterBrowser(): ParameterBrowserAccess {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useParameterBrowser must be used within <WidgetAttrProvider>");

  const runtimeCompatibility = useRuntimeCompatibility();
  const binding = runtimeCompatibility.resolveCapability(ctx.instanceId, PARAMETER_CAPABILITY);
  if (!binding || binding.kind !== "parameterProvider") {
    throw new Error(`GGCS has no ParameterProvider mapping for ${ctx.instanceId}::${PARAMETER_CAPABILITY}`);
  }

  const provider = runtimeCompatibility.resourceForCapability<ParameterProvider>(
    ctx.instanceId,
    PARAMETER_CAPABILITY,
  );
  if (!provider || provider.kind !== "parameter_provider") {
    throw new Error(`GGCS ParameterProvider unavailable for ${ctx.instanceId}::${PARAMETER_CAPABILITY}`);
  }

  return useMemo(() => ({
    async listNodes() {
      const descriptors = await provider.list();
      const nodes = new Set<string>();
      descriptors.forEach((descriptor) => {
        const node = nodeForParameterId(descriptor.id);
        if (node) nodes.add(node);
      });
      return Array.from(nodes).sort();
    },
    async listParameterIds(node?: string) {
      const descriptors = await provider.list(node ? { prefix: `${node}:` } : undefined);
      return descriptors.map((descriptor) => descriptor.id);
    },
    async read(id: string) {
      const parameter = await provider.resolve<string>(id);
      return parameter.refresh().result();
    },
    async write(id: string, value: string) {
      const parameter = await provider.resolve<string>(id);
      await parameter.write(value).result();
    },
  }), [provider]);
}
