import http, { type ServerResponse } from "node:http";
import net, { type Socket } from "node:net";

const dataPort = Number(process.env.GGCS_M03_PROXY_DATA_PORT ?? "9091");
const controlPort = Number(process.env.GGCS_M03_PROXY_CONTROL_PORT ?? "9092");
const upstreamHost = process.env.GGCS_M03_PROXY_UPSTREAM_HOST ?? "m03-rosbridge";
const upstreamPort = Number(process.env.GGCS_M03_PROXY_UPSTREAM_PORT ?? "9090");

interface SocketPair {
  readonly client: Socket;
  readonly upstream: Socket;
}

let enabled = true;
const pairs = new Set<SocketPair>();

function closePair(pair: SocketPair): void {
  pairs.delete(pair);
  if (!pair.client.destroyed) pair.client.destroy();
  if (!pair.upstream.destroyed) pair.upstream.destroy();
}

const dataServer = net.createServer((client) => {
  if (!enabled) {
    client.destroy();
    return;
  }

  const upstream = net.createConnection({ host: upstreamHost, port: upstreamPort });
  const pair: SocketPair = { client, upstream };
  pairs.add(pair);

  const close = (): void => closePair(pair);
  client.on("error", close);
  client.on("close", close);
  upstream.on("error", close);
  upstream.on("close", close);
  upstream.on("connect", () => {
    if (!enabled) {
      close();
      return;
    }
    client.pipe(upstream);
    upstream.pipe(client);
  });
});

function writeJson(
  response: ServerResponse,
  statusCode: number,
  value: Readonly<Record<string, unknown>>,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(value));
}

const controlServer = http.createServer((request, response) => {
  if (request.method === "POST" && request.url === "/cut") {
    enabled = false;
    for (const pair of [...pairs]) closePair(pair);
    writeJson(response, 200, { enabled, activeConnections: pairs.size });
    return;
  }
  if (request.method === "POST" && request.url === "/restore") {
    enabled = true;
    writeJson(response, 200, { enabled, activeConnections: pairs.size });
    return;
  }
  if (request.method === "GET" && request.url === "/status") {
    writeJson(response, 200, { enabled, activeConnections: pairs.size });
    return;
  }
  writeJson(response, 404, { error: "not_found" });
});

dataServer.listen(dataPort, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      mode: "m03-link-fault-proxy",
      dataPort,
      controlPort,
      upstreamHost,
      upstreamPort,
    }),
  );
});
controlServer.listen(controlPort, "0.0.0.0");
