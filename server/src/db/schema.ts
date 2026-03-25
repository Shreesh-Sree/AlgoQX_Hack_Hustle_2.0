import { pgTable, text, real, integer, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  gstin: text("gstin").primaryKey(),
  companyName: text("company_name").notNull(),
  state: text("state").notNull(),
  registrationDate: text("registration_date").notNull(),
  fraudScore: real("fraud_score").notNull().default(0),
  riskLevel: text("risk_level").notNull().default("LOW"),
});

export const insertCompanySchema = createInsertSchema(companiesTable);
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;

export const invoicesTable = pgTable("invoices", {
  invoiceId: text("invoice_id").primaryKey(),
  sellerGstin: text("seller_gstin").notNull().references(() => companiesTable.gstin),
  buyerGstin: text("buyer_gstin").notNull().references(() => companiesTable.gstin),
  invoiceDate: text("invoice_date").notNull(),
  taxableValue: real("taxable_value").notNull(),
  cgst: real("cgst").notNull(),
  sgst: real("sgst").notNull(),
  igst: real("igst").notNull(),
  totalTax: real("total_tax").notNull(),
  invoiceAmount: real("invoice_amount").notNull(),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable);
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;

export const fraudRingsTable = pgTable("fraud_rings", {
  ringId: serial("ring_id").primaryKey(),
  cyclePath: text("cycle_path").notNull(),
  cycleLength: integer("cycle_length").notNull(),
  totalCyclingValue: real("total_cycling_value").notNull(),
  detectedAt: text("detected_at").notNull(),
});

export const insertFraudRingSchema = createInsertSchema(fraudRingsTable).omit({ ringId: true });
export type InsertFraudRing = z.infer<typeof insertFraudRingSchema>;
export type FraudRing = typeof fraudRingsTable.$inferSelect;

export const entityScoresTable = pgTable("entity_scores", {
  gstin: text("gstin").primaryKey().references(() => companiesTable.gstin),
  taxMismatchRatio: real("tax_mismatch_ratio").notNull().default(0),
  volumeSpikeScore: real("volume_spike_score").notNull().default(0),
  duplicateInvoiceCount: integer("duplicate_invoice_count").notNull().default(0),
  cycleParticipation: integer("cycle_participation").notNull().default(0),
  shellCompanyScore: real("shell_company_score").notNull().default(0),
  pagerankAnomaly: real("pagerank_anomaly").notNull().default(0),
  isolationForestLabel: integer("isolation_forest_label").notNull().default(1),
  compositeScore: real("composite_score").notNull().default(0),
});

export const insertEntityScoreSchema = createInsertSchema(entityScoresTable);
export type InsertEntityScore = z.infer<typeof insertEntityScoreSchema>;
export type EntityScore = typeof entityScoresTable.$inferSelect;

export const dataSourceTable = pgTable("data_source", {
  id: serial("id").primaryKey(),
  source: text("source").notNull().default("synthetic"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
