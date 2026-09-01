import ROSLIB from "roslib";

export type RosbridgeClientEvent = "connection" | "close" | "error";
export type RosbridgeClientListener = (value?: unknown) => void;

/**
 * Narrow seam around the ROSLIB session used by the transport provider.
 * Tests inject this interface so connection/reconnect behavior never needs
 * real sleeps or external networking.
 */
export interface RosbridgeClient {
  readonly isConnected: boolean;
  on(event: RosbridgeClientEvent, listener: RosbridgeClientListener): void;
  connect(url: string): void;
  close(): void;
}

export interface RosbridgeClientFactory {
  create(): RosbridgeClient;
}

class RoslibClient implements RosbridgeClient {
  private readonly ros = new ROSLIB.Ros({});

  get isConnected(): boolean {
    return this.ros.isConnected;
  }

  on(event: RosbridgeClientEvent, listener: RosbridgeClientListener): void {
    this.ros.on(event, listener);
  }

  connect(url: string): void {
    this.ros.connect(url);
  }

  close(): void {
    this.ros.close();
  }
}

export const defaultRosbridgeClientFactory: RosbridgeClientFactory = {
  create(): RosbridgeClient {
    return new RoslibClient();
  },
};
