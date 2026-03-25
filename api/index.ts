/**
 * Vercel Serverless Function entry point.
 * This wraps the Express app so Vercel can invoke it as a serverless function.
 */
import app from "../server/src/app";
import { seedIfEmpty } from "../server/src/lib/seed";

let seeded = false;
(async () => {
  if (!seeded) {
    seeded = true;
    try { await seedIfEmpty(); } catch { /* ignore in serverless */ }
  }
})();

export default app;
