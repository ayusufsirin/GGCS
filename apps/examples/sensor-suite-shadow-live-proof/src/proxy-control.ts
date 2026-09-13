import http from "node:http";

export class LinkFaultProxyControl {
  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {}

  cut(): Promise<void> {
    return this.post("/cut");
  }

  restore(): Promise<void> {
    return this.post("/restore");
  }

  private post(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = http.request(
        {
          host: this.host,
          port: this.port,
          path,
          method: "POST",
        },
        (response) => {
          response.resume();
          if ((response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300) {
            resolve();
          } else {
            reject(new Error(`Proxy control ${path} returned HTTP ${response.statusCode ?? "unknown"}`));
          }
        },
      );
      request.on("error", reject);
      request.end();
    });
  }
}
