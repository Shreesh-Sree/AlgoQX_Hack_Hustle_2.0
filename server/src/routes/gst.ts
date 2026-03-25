import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { eq, desc } from "drizzle-orm";
import { db, companiesTable, invoicesTable, fraudRingsTable, entityScoresTable, dataSourceTable } from "../db";
import { analyzeGSTData, getPrimaryRedFlag, buildGraphData, getMonthlyFilings, parseCompaniesCSV, parseInvoicesCSV } from "../lib/fraudEngine";
import { generateSyntheticData } from "../lib/syntheticData";

const MAX_RING_SIZE = 20;

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Helper: re-run analysis and update DB
async function runAnalysisAndUpdate(): Promise<void> {
  const companies = await db.select().from(companiesTable);
  const invoices = await db.select().from(invoicesTable);

  if (companies.length === 0) return;

  const { companyUpdates, entityScores, fraudRings } = analyzeGSTData(companies, invoices);

  // Clear old analysis data
  await db.delete(fraudRingsTable);
  await db.delete(entityScoresTable);

  // Insert new analysis data
  if (fraudRings.length > 0) {
    await db.insert(fraudRingsTable).values(fraudRings);
  }
  if (entityScores.length > 0) {
    await db.insert(entityScoresTable).values(entityScores);
  }

  // Update fraud scores
  for (const update of companyUpdates) {
    await db
      .update(companiesTable)
      .set({ fraudScore: update.fraudScore, riskLevel: update.riskLevel } as any)
      .where(eq(companiesTable.gstin, update.gstin));
  }
}

// GET /dashboard-stats
router.get("/dashboard-stats", async (req, res): Promise<void> => {
  const companies = await db.select().from(companiesTable);
  const invoices = await db.select().from(invoicesTable);
  const rings = await db.select().from(fraudRingsTable);
  const scores = await db.select().from(entityScoresTable);
  const dsRow = await db.select().from(dataSourceTable).orderBy(desc(dataSourceTable.updatedAt)).limit(1);

  const highRisk = companies.filter((c) => c.riskLevel === "HIGH" || c.riskLevel === "CRITICAL").length;
  const critical = companies.filter((c) => c.riskLevel === "CRITICAL").length;
  const validRings = rings.filter((r) => r.cycleLength <= MAX_RING_SIZE);
  const suspiciousGstins = new Set<string>();
  for (const r of validRings) {
    const path = JSON.parse(r.cyclePath) as string[];
    for (const g of path) suspiciousGstins.add(g);
  }
  const suspiciousInvoices = invoices.filter(
    (inv) => suspiciousGstins.has(inv.sellerGstin) || suspiciousGstins.has(inv.buyerGstin)
  );
  const totalSuspiciousValue = suspiciousInvoices.reduce((s, inv) => s + inv.invoiceAmount, 0);
  const avgScore = scores.length > 0 ? scores.reduce((s, sc) => s + sc.compositeScore, 0) / scores.length : 0;

  res.json({
    totalEntities: companies.length,
    fraudRingsDetected: validRings.length,
    highRiskEntities: highRisk,
    criticalEntities: critical,
    totalSuspiciousValue: Math.round(totalSuspiciousValue),
    totalInvoices: invoices.length,
    averageFraudScore: Math.round(avgScore * 10) / 10,
    dataSource: dsRow[0]?.source ?? "synthetic",
  });
});

// GET /companies
router.get("/companies", async (req, res): Promise<void> => {
  const { sortBy, riskLevel, search } = req.query as {
    sortBy?: string;
    riskLevel?: string;
    search?: string;
  };

  const companies = await db.select().from(companiesTable);
  const scores = await db.select().from(entityScoresTable);
  const invoices = await db.select().from(invoicesTable);
  const scoreMap = new Map(scores.map((s) => [s.gstin, s]));

  const sellerCount = new Map<string, number>();
  const buyerCount = new Map<string, number>();
  for (const inv of invoices) {
    sellerCount.set(inv.sellerGstin, (sellerCount.get(inv.sellerGstin) ?? 0) + 1);
    buyerCount.set(inv.buyerGstin, (buyerCount.get(inv.buyerGstin) ?? 0) + 1);
  }

  let result = companies.map((c) => {
    const score = scoreMap.get(c.gstin);
    return {
      gstin: c.gstin,
      companyName: c.companyName,
      state: c.state,
      registrationDate: c.registrationDate,
      fraudScore: c.fraudScore,
      riskLevel: c.riskLevel,
      primaryRedFlag: score ? getPrimaryRedFlag(score) : "None",
      cycleParticipation: score?.cycleParticipation ?? 0,
      totalInvoicesAsSeller: sellerCount.get(c.gstin) ?? 0,
      totalInvoicesAsBuyer: buyerCount.get(c.gstin) ?? 0,
    };
  });

  if (riskLevel) result = result.filter((c) => c.riskLevel === riskLevel);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter((c) => c.companyName.toLowerCase().includes(q) || c.gstin.toLowerCase().includes(q));
  }
  if (sortBy === "fraud_score") result.sort((a, b) => b.fraudScore - a.fraudScore);
  else if (sortBy === "company_name") result.sort((a, b) => a.companyName.localeCompare(b.companyName));
  else result.sort((a, b) => b.fraudScore - a.fraudScore); // default

  res.json(result);
});

// GET /companies/:gstin
router.get("/companies/:gstin", async (req, res): Promise<void> => {
  const rawGstin = Array.isArray(req.params.gstin) ? req.params.gstin[0] : req.params.gstin;
  const company = await db.select().from(companiesTable).where(eq(companiesTable.gstin, rawGstin)).limit(1);
  if (!company[0]) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  const score = await db.select().from(entityScoresTable).where(eq(entityScoresTable.gstin, rawGstin)).limit(1);
  const allInvoices = await db.select().from(invoicesTable);
  const rings = await db.select().from(fraudRingsTable);

  const companyInvoices = allInvoices.filter(
    (inv) => inv.sellerGstin === rawGstin || inv.buyerGstin === rawGstin
  );

  const connectedSet = new Set<string>();
  for (const inv of companyInvoices) {
    if (inv.sellerGstin !== rawGstin) connectedSet.add(inv.sellerGstin);
    if (inv.buyerGstin !== rawGstin) connectedSet.add(inv.buyerGstin);
  }

  const fraudRingIds: number[] = [];
  for (const ring of rings) {
    const path = JSON.parse(ring.cyclePath) as string[];
    if (path.includes(rawGstin)) fraudRingIds.push(ring.ringId);
  }

  const monthly = getMonthlyFilings(rawGstin, allInvoices);
  const sc = score[0];
  const c = company[0];

  res.json({
    gstin: c.gstin,
    companyName: c.companyName,
    state: c.state,
    registrationDate: c.registrationDate,
    fraudScore: c.fraudScore,
    riskLevel: c.riskLevel,
    primaryRedFlag: sc ? getPrimaryRedFlag(sc) : "None",
    featureScores: sc ? {
      taxMismatchRatio: sc.taxMismatchRatio,
      volumeSpikeScore: sc.volumeSpikeScore,
      duplicateInvoiceCount: sc.duplicateInvoiceCount,
      cycleParticipation: sc.cycleParticipation,
      shellCompanyScore: sc.shellCompanyScore,
      pagerankAnomaly: sc.pagerankAnomaly,
      isolationForestLabel: sc.isolationForestLabel,
      compositeScore: sc.compositeScore,
    } : {
      taxMismatchRatio: 0, volumeSpikeScore: 1, duplicateInvoiceCount: 0,
      cycleParticipation: 0, shellCompanyScore: 0, pagerankAnomaly: 0,
      isolationForestLabel: 1, compositeScore: 0,
    },
    monthlyFilings: monthly,
    connectedEntities: [...connectedSet].slice(0, 20),
    fraudRingIds,
  });
});

// GET /graph
router.get("/graph", async (req, res): Promise<void> => {
  const companies = await db.select().from(companiesTable);
  const invoices = await db.select().from(invoicesTable);
  const scores = await db.select().from(entityScoresTable);
  const rings = await db.select().from(fraudRingsTable);

  const graphData = buildGraphData(companies, invoices, scores, rings);
  res.json(graphData);
});

// GET /fraud-rings
router.get("/fraud-rings", async (req, res): Promise<void> => {
  const rings = await db.select().from(fraudRingsTable);
  const companies = await db.select().from(companiesTable);
  const companyMap = new Map(companies.map((c) => [c.gstin, c.companyName]));

  const result = rings
    .filter((ring) => ring.cycleLength <= MAX_RING_SIZE)
    .map((ring) => {
      const path = JSON.parse(ring.cyclePath) as string[];
      return {
        ringId: ring.ringId,
        cyclePath: path,
        cycleLength: ring.cycleLength,
        totalCyclingValue: ring.totalCyclingValue,
        detectedAt: ring.detectedAt,
        companyNames: path.map((g) => companyMap.get(g) ?? g),
      };
    });

  res.json(result);
});

// GET /anomalies
router.get("/anomalies", async (req, res): Promise<void> => {
  const scores = await db.select().from(entityScoresTable);
  const companies = await db.select().from(companiesTable);
  const companyMap = new Map(companies.map((c) => [c.gstin, c]));

  const anomalies = scores
    .filter((s) => s.isolationForestLabel === -1 || s.compositeScore > 30)
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((s) => {
      const c = companyMap.get(s.gstin);
      const flags: string[] = [];
      if (s.cycleParticipation > 0) flags.push(`In ${s.cycleParticipation} fraud ring(s)`);
      if (s.taxMismatchRatio > 1) flags.push("High ITC claim vs output");
      if (s.shellCompanyScore > 0.5) flags.push("Shell company pattern");
      if (s.volumeSpikeScore > 5) flags.push(`Volume spike ${Math.round(s.volumeSpikeScore)}x`);
      if (s.duplicateInvoiceCount > 0) flags.push(`${s.duplicateInvoiceCount} duplicate invoices`);
      if (s.isolationForestLabel === -1) flags.push("ML anomaly detected");

      const anomalyType = s.cycleParticipation > 0 ? "Circular Trading" :
        s.shellCompanyScore > 0.5 ? "Shell Company" :
        s.taxMismatchRatio > 2 ? "Tax Mismatch" :
        s.volumeSpikeScore > 5 ? "Volume Spike" :
        s.duplicateInvoiceCount > 0 ? "Duplicate Invoices" : "Statistical Outlier";

      return {
        gstin: s.gstin,
        companyName: c?.companyName ?? s.gstin,
        fraudScore: s.compositeScore,
        riskLevel: (c?.riskLevel ?? "LOW") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
        anomalyType,
        anomalyScore: Math.min(s.compositeScore / 100, 1),
        flags: flags.length > 0 ? flags : ["Statistical outlier"],
      };
    });

  res.json(anomalies);
});

// POST /upload/companies
router.post("/upload/companies", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, message: "No file uploaded", recordsProcessed: 0, errors: ["No file"] });
    return;
  }

  const csvText = req.file.buffer.toString("utf-8");
  const { companies, errors } = parseCompaniesCSV(csvText);

  if (companies.length === 0) {
    res.status(400).json({ success: false, message: "No valid companies found", recordsProcessed: 0, errors });
    return;
  }

  // Clear existing and insert new
  await db.delete(entityScoresTable);
  await db.delete(fraudRingsTable);
  await db.delete(invoicesTable);
  await db.delete(companiesTable);

  const validCompanies = companies.filter(
    (c): c is Required<typeof c> => !!(c.gstin && c.companyName && c.state && c.registrationDate)
  );

  if (validCompanies.length > 0) {
    await db.insert(companiesTable).values(validCompanies);
  }

  await db.delete(dataSourceTable);
  await db.insert(dataSourceTable).values({ source: "uploaded" });

  res.json({
    success: true,
    message: `Uploaded ${validCompanies.length} companies`,
    recordsProcessed: validCompanies.length,
    errors,
  });
});

// POST /upload/invoices
router.post("/upload/invoices", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, message: "No file uploaded", recordsProcessed: 0, errors: ["No file"] });
    return;
  }

  const csvText = req.file.buffer.toString("utf-8");
  const { invoices, errors } = parseInvoicesCSV(csvText);

  if (invoices.length === 0) {
    res.status(400).json({ success: false, message: "No valid invoices found", recordsProcessed: 0, errors });
    return;
  }

  // Validate that seller/buyer GSTINs exist
  const existingCompanies = await db.select().from(companiesTable);
  const gstinSet = new Set(existingCompanies.map((c) => c.gstin));
  const validInvoices = invoices.filter((inv) => gstinSet.has(inv.sellerGstin!) && gstinSet.has(inv.buyerGstin!));
  const skipped = invoices.length - validInvoices.length;
  if (skipped > 0) errors.push(`Skipped ${skipped} invoices with unknown GSTINs`);

  if (validInvoices.length > 0) {
    await db.delete(entityScoresTable);
    await db.delete(fraudRingsTable);
    await db.delete(invoicesTable);
    const fullInvoices = validInvoices as Required<typeof validInvoices[0]>[];
    await db.insert(invoicesTable).values(fullInvoices);
    await runAnalysisAndUpdate();
  }

  await db.delete(dataSourceTable);
  await db.insert(dataSourceTable).values({ source: "uploaded" });

  res.json({
    success: true,
    message: `Processed ${validInvoices.length} invoices`,
    recordsProcessed: validInvoices.length,
    errors,
  });
});

// POST /upload/reset
router.post("/upload/reset", async (req, res): Promise<void> => {
  await db.delete(entityScoresTable);
  await db.delete(fraudRingsTable);
  await db.delete(invoicesTable);
  await db.delete(companiesTable);

  const { companies, invoices } = generateSyntheticData();
  await db.insert(companiesTable).values(companies);
  await db.insert(invoicesTable).values(invoices);
  await runAnalysisAndUpdate();
  await db.delete(dataSourceTable);
  await db.insert(dataSourceTable).values({ source: "synthetic" });

  res.json({
    success: true,
    message: "Reset to synthetic demo data",
    recordsProcessed: companies.length,
    errors: [],
  });
});

// GET /export/companies
router.get("/export/companies", async (req, res): Promise<void> => {
  const companies = await db.select().from(companiesTable).orderBy(desc(companiesTable.fraudScore));
  const scores = await db.select().from(entityScoresTable);
  const invoices = await db.select().from(invoicesTable);
  const scoreMap = new Map(scores.map((s) => [s.gstin, s]));

  const sellerCount = new Map<string, number>();
  const buyerCount = new Map<string, number>();
  for (const inv of invoices) {
    sellerCount.set(inv.sellerGstin, (sellerCount.get(inv.sellerGstin) ?? 0) + 1);
    buyerCount.set(inv.buyerGstin, (buyerCount.get(inv.buyerGstin) ?? 0) + 1);
  }

  const result = companies.map((c) => {
    const score = scoreMap.get(c.gstin);
    return {
      gstin: c.gstin,
      companyName: c.companyName,
      state: c.state,
      registrationDate: c.registrationDate,
      fraudScore: c.fraudScore,
      riskLevel: c.riskLevel,
      primaryRedFlag: score ? getPrimaryRedFlag(score) : "None",
      cycleParticipation: score?.cycleParticipation ?? 0,
      totalInvoicesAsSeller: sellerCount.get(c.gstin) ?? 0,
      totalInvoicesAsBuyer: buyerCount.get(c.gstin) ?? 0,
    };
  });

  res.json({
    companies: result,
    exportedAt: new Date().toISOString(),
    totalRecords: result.length,
  });
});

// GET /export/report
router.get("/export/report", async (req, res): Promise<void> => {
  const companies = await db.select().from(companiesTable);
  const invoices = await db.select().from(invoicesTable);
  const rings = await db.select().from(fraudRingsTable);
  const scores = await db.select().from(entityScoresTable);
  const companyMap = new Map(companies.map((c) => [c.gstin, c]));
  const scoreMap = new Map(scores.map((s) => [s.gstin, s]));
  const dsRow = await db.select().from(dataSourceTable).orderBy(desc(dataSourceTable.updatedAt)).limit(1);

  const sellerCount = new Map<string, number>();
  const buyerCount = new Map<string, number>();
  for (const inv of invoices) {
    sellerCount.set(inv.sellerGstin, (sellerCount.get(inv.sellerGstin) ?? 0) + 1);
    buyerCount.set(inv.buyerGstin, (buyerCount.get(inv.buyerGstin) ?? 0) + 1);
  }

  const highRisk = companies.filter((c) => c.fraudScore > 60).length;
  const critical = companies.filter((c) => c.riskLevel === "CRITICAL").length;
  const suspiciousGstins = new Set<string>();
  for (const r of rings) {
    const path = JSON.parse(r.cyclePath) as string[];
    for (const g of path) suspiciousGstins.add(g);
  }
  const suspiciousValue = invoices
    .filter((inv) => suspiciousGstins.has(inv.sellerGstin) || suspiciousGstins.has(inv.buyerGstin))
    .reduce((s, inv) => s + inv.invoiceAmount, 0);

  const stats = {
    totalEntities: companies.length,
    fraudRingsDetected: rings.length,
    highRiskEntities: highRisk,
    criticalEntities: critical,
    totalSuspiciousValue: Math.round(suspiciousValue),
    totalInvoices: invoices.length,
    averageFraudScore: scores.length > 0 ? Math.round(scores.reduce((s, sc) => s + sc.compositeScore, 0) / scores.length * 10) / 10 : 0,
    dataSource: (dsRow[0]?.source ?? "synthetic") as "synthetic" | "uploaded",
  };

  const highRiskCompanies = companies
    .filter((c) => c.fraudScore > 30)
    .sort((a, b) => b.fraudScore - a.fraudScore)
    .slice(0, 20)
    .map((c) => {
      const score = scoreMap.get(c.gstin);
      return {
        gstin: c.gstin,
        companyName: c.companyName,
        state: c.state,
        registrationDate: c.registrationDate,
        fraudScore: c.fraudScore,
        riskLevel: c.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
        primaryRedFlag: score ? getPrimaryRedFlag(score) : "None",
        cycleParticipation: score?.cycleParticipation ?? 0,
        totalInvoicesAsSeller: sellerCount.get(c.gstin) ?? 0,
        totalInvoicesAsBuyer: buyerCount.get(c.gstin) ?? 0,
      };
    });

  const fraudRingData = rings.map((ring) => {
    const path = JSON.parse(ring.cyclePath) as string[];
    return {
      ringId: ring.ringId,
      cyclePath: path,
      cycleLength: ring.cycleLength,
      totalCyclingValue: ring.totalCyclingValue,
      detectedAt: ring.detectedAt,
      companyNames: path.map((g) => companyMap.get(g)?.companyName ?? g),
    };
  });

  const anomalies = scores
    .filter((s) => s.compositeScore > 30)
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((s) => {
      const c = companyMap.get(s.gstin);
      const flags: string[] = [];
      if (s.cycleParticipation > 0) flags.push(`In ${s.cycleParticipation} fraud ring(s)`);
      if (s.taxMismatchRatio > 1) flags.push("High ITC claim");
      if (s.shellCompanyScore > 0.5) flags.push("Shell company");
      if (s.volumeSpikeScore > 5) flags.push("Volume spike");
      return {
        gstin: s.gstin,
        companyName: c?.companyName ?? s.gstin,
        fraudScore: s.compositeScore,
        riskLevel: (c?.riskLevel ?? "LOW") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
        anomalyType: s.cycleParticipation > 0 ? "Circular Trading" : "Statistical Outlier",
        anomalyScore: Math.min(s.compositeScore / 100, 1),
        flags: flags.length > 0 ? flags : ["Statistical outlier"],
      };
    });

  const totalRingValue = rings.reduce((s, r) => s + r.totalCyclingValue, 0);

  res.json({
    generatedAt: new Date().toISOString(),
    stats,
    highRiskCompanies,
    fraudRings: fraudRingData,
    anomalies,
    summary: `Analysis of ${companies.length} GST entities and ${invoices.length} invoices detected ${rings.length} fraud rings with ₹${(totalRingValue / 1e7).toFixed(2)} Cr in circular transactions. ${critical} entities are CRITICAL risk, ${highRisk} are HIGH risk.`,
  });
});

export default router;
