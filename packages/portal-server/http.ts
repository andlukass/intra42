import type { IncomingMessage, ServerResponse } from "node:http";

export function isLocalPost(req: IncomingMessage) {
  return (
    req.method === "POST" &&
    req.headers.origin === `http://${req.headers.host}` &&
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "")
  );
}

export function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Cache-Control": "no-store", "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
