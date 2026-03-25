/**
 * Vercel Serverless Function entry point.
 * Wraps the Express app so Vercel can invoke it as a serverless function.
 */
import type { Request, Response, NextFunction } from "express";
import app from "../server/src/app";
import { seedIfEmpty } from "../server/src/lib/seed";

// Seed once per cold start — failures are non-fatal
let seeded = false;
if (!seeded) {
  seeded = true;
  seedIfEmpty().catch((err) =>
    console.error("Seed error (non-fatal):", err?.message ?? err)
  );
}

// Global error handler so unhandled route errors return JSON, not HTML
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  const msg = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: msg });
});

export default app;
