import { useContext, useMemo } from "react";
import type { ParameterProvider } from "@ggcs/core";
import { Ctx } from "./common";
import { serviceBus, svcKey } from "../service-bus";
import { backendUsesRuntimeForParameters } from "../../runtime/backend-mode";
import { isM04Slice5RuntimeParameterCapability } from "../../runtime/compatibility-map";
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
  const runtimeParameters =
    backendUsesRuntimeForParameters(runtimeCompatibility.mode) &&
    isM04Slice5RuntimeParameterCapability(ctx.instanceId, PARAMETER_CAPABILITY);

  const provider = runtimeParameters
    ? runtimeCompatibility.resourceForCapability<ParameterProvider>(
        ctx.instanceId,
        PARAMETER_CAPABILITY,
      )
    : undefined;

  if (runtimeParameters && (!provider || provider.kind !== "parameter_provider")) {
    throw new Error(
      `GGCS compat ParameterProvider unavailable for ${ctx.instanceId}::${PARAMETER_CAPABILITY}`,
    );
  }

  return useMemo(() => {
    if (runtimeParameters) {
      const runtimeProvider = provider!;
      return {
        async listNodes() {
          const descriptors = await runtimeProvider.list();
          const nodes = new Set<string>();
          descriptors.forEach((descriptor) => {
            const node = nodeForParameterId(descriptor.id);
            if (node) nodes.add(node);
          });
          return Array.from(nodes).sort();
        },
        async listParameterIds(node?: string) {
          const descriptors = await runtimeProvider.list(
            node ? { prefix: `${node}:` } : undefined,
          );
          return descriptors.map((descriptor) => descriptor.id);
        },
        async read(id: string) {
          const parameter = await runtimeProvider.resolve<string>(id);
          return parameter.refresh().result();
        },
        async write(id: string, value: string) {
          const parameter = await runtimeProvider.resolve<string>(id);
          await parameter.write(value).result();
        },
      };
    }

    const listNodesKey = svcKey(ctx.instanceId, "listNodes");
    const getParamNamesKey = svcKey(ctx.instanceId, "getParamNames");
    const getParamKey = svcKey(ctx.instanceId, "getParam");
    const setParamKey = svcKey(ctx.instanceId, "setParam");

    return {
      async listNodes() {
        const response = await serviceBus.call<{ nodes: string[] }>(
          listNodesKey,
          {},
          { timeoutMs: 10_000 },
        );
        return response.nodes ?? [];
      },
      async listParameterIds(node?: string) {
        const response = await serviceBus.call<{ names: string[] }>(
          getParamNamesKey,
          {},
          { timeoutMs: 15_000 },
        );
        const names = response.names ?? [];
        return node ? names.filter((name) => name.startsWith(node)) : names;
      },
      async read(id: string) {
        const response = await serviceBus.call<{ value: string }>(
          getParamKey,
          { name: id },
          { timeoutMs: 8_000 },
        );
        return String(response.value ?? "");
      },
      async write(id: string, value: string) {
        await serviceBus.call(
          setParamKey,
          { name: id, value },
          { timeoutMs: 10_000 },
        );
      },
    };
  }, [ctx.instanceId, provider, runtimeParameters]);
}
