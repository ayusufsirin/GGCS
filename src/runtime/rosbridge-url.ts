export interface BrowserLocationLike {
  readonly protocol: string;
  readonly hostname: string;
  readonly port: string;
  readonly search: string;
}

export interface ResolveRosbridgeUrlOptions {
  readonly envUrl?: string;
  readonly location?: BrowserLocationLike;
}

function websocketScheme(location: BrowserLocationLike): "ws" | "wss" {
  return location.protocol === "https:" ? "wss" : "ws";
}

export function buildDynamicRosbridgeUrl(location: BrowserLocationLike): string {
  const host = location.hostname || "localhost";
  const port = location.port ? `:${location.port}` : ":9090";
  return `${websocketScheme(location)}://${host}${port}`;
}

export function getRosbridgeQueryOverride(location: BrowserLocationLike): string | null {
  try {
    const params = new URLSearchParams(location.search);
    const raw = params.get("rosbridge");
    if (!raw) return null;
    if (/^wss?:\/\//i.test(raw)) return raw;

    const hostPort = /:\d+$/.test(raw) ? raw : `${raw}:9090`;
    return `${websocketScheme(location)}://${hostPort}`;
  } catch {
    return null;
  }
}

function currentBrowserLocation(): BrowserLocationLike | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location;
}

export function resolveRosbridgeUrl(options: ResolveRosbridgeUrlOptions = {}): string {
  const location = options.location ?? currentBrowserLocation();
  const queryUrl = location ? getRosbridgeQueryOverride(location) : null;
  if (queryUrl) return queryUrl;
  if (options.envUrl) return options.envUrl;
  if (location) return buildDynamicRosbridgeUrl(location);
  return "ws://localhost:9090";
}
