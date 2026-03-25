/**
 * Vercel Serverless Function entry point.
 * Imports from the pre-compiled server/dist (built in buildCommand).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { default: app } = require("../server/dist/app");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedIfEmpty } = require("../server/dist/lib/seed");

// Seed once per cold start — failures are non-fatal
let seeded = false;
if (!seeded) {
  seeded = true;
  (seedIfEmpty as () => Promise<void>)().catch((err: unknown) =>
    console.error("Seed error (non-fatal):", (err as Error)?.message ?? err)
  );
}

module.exports = app;
