import { db, companiesTable, invoicesTable, fraudRingsTable, entityScoresTable, dataSourceTable } from "../db";
import type { InsertEntityScore, InsertInvoice } from "../db/schema";
import { generateSyntheticData } from "./syntheticData";
import { analyzeGSTData } from "./fraudEngine";
import { eq } from "drizzle-orm";

export async function seedIfEmpty(): Promise<void> {
  const existing = await db.select().from(companiesTable).limit(1);
  if (existing.length > 0) {
    console.log("Database already has data, skipping seed");
    return;
  }

  console.log("Seeding database with synthetic GST data...");
  const { companies, invoices } = generateSyntheticData();

  await db.insert(companiesTable).values(companies);
  console.log(`Inserted ${companies.length} companies`);

  const INVOICE_CHUNK = 50;
  for (let i = 0; i < invoices.length; i += INVOICE_CHUNK) {
    await db.insert(invoicesTable).values(invoices.slice(i, i + INVOICE_CHUNK) as InsertInvoice[]);
  }
  console.log(`Inserted ${invoices.length} invoices`);

  const { companyUpdates, entityScores, fraudRings } = analyzeGSTData(companies as any, invoices);

  if (fraudRings.length > 0) {
    await db.insert(fraudRingsTable).values(fraudRings);
    console.log(`Inserted ${fraudRings.length} fraud rings`);
  }

  if (entityScores.length > 0) {
    const SCORE_CHUNK = 25;
    for (let i = 0; i < entityScores.length; i += SCORE_CHUNK) {
      await db.insert(entityScoresTable).values(entityScores.slice(i, i + SCORE_CHUNK) as InsertEntityScore[]);
    }
    console.log(`Inserted ${entityScores.length} entity scores`);
  }

  for (const update of companyUpdates) {
    await db
      .update(companiesTable)
      .set({ fraudScore: update.fraudScore, riskLevel: update.riskLevel } as any)
      .where(eq(companiesTable.gstin, update.gstin));
  }

  await db.insert(dataSourceTable).values({ source: "synthetic" });
  console.log("Database seeded successfully");
}
