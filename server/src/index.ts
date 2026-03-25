import app from "./app";
import { seedIfEmpty } from "./lib/seed";

const port = Number(process.env.PORT ?? 3001);

app.listen(port, async () => {
  console.log(`API server listening on port ${port}`);
  try {
    await seedIfEmpty();
  } catch (err) {
    console.error("Failed to seed database on startup:", err);
  }
});
