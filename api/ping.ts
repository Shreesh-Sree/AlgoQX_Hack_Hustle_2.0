import type { IncomingMessage, ServerResponse } from "http";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({
    ok: true,
    ts: Date.now(),
    env: !!process.env.DATABASE_URL,
    node: process.version,
  }));
}
