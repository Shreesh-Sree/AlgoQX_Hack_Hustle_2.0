import type { Company, Invoice, InsertFraudRing, InsertEntityScore, InsertCompany, InsertInvoice } from "../db";

interface GraphNode {
  gstin: string;
  inDegree: number;
  outDegree: number;
  totalInflow: number;
  totalOutflow: number;
  neighbors: Map<string, { value: number; count: number }>;
  reverseNeighbors: Set<string>;
  monthlyInvoiceCounts: Map<string, number>;
}

// Simple PageRank implementation
function computePageRank(
  adjacency: Map<string, Map<string, number>>,
  nodes: string[],
  iterations = 20,
  dampingFactor = 0.85
): Map<string, number> {
  const n = nodes.length;
  const ranks = new Map<string, number>();
  nodes.forEach((n) => ranks.set(n, 1 / nodes.length));

  const outDegreeSums = new Map<string, number>();
  for (const [from, toMap] of adjacency.entries()) {
    let sum = 0;
    for (const val of toMap.values()) sum += val;
    outDegreeSums.set(from, sum);
  }

  for (let iter = 0; iter < iterations; iter++) {
    const newRanks = new Map<string, number>();
    for (const node of nodes) {
      let rank = (1 - dampingFactor) / n;
      for (const [from, toMap] of adjacency.entries()) {
        if (toMap.has(node)) {
          const outSum = outDegreeSums.get(from) ?? 1;
          rank += dampingFactor * ((ranks.get(from) ?? 0) * ((toMap.get(node) ?? 0) / outSum));
        }
      }
      newRanks.set(node, rank);
    }
    for (const [k, v] of newRanks.entries()) ranks.set(k, v);
  }
  return ranks;
}

// Maximum SCC size to be classified as a fraud ring.
// Giant SCCs (e.g. most of the graph) are almost certainly noise, not an actual ring.
const MAX_RING_SIZE = 20;

// Tarjan's Strongly Connected Components algorithm - O(V+E)
// Returns all SCCs with 2 <= size <= MAX_RING_SIZE (circular trading rings)
function findFraudRingSCCs(adjacency: Map<string, Set<string>>, nodes: string[]): string[][] {
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;

  function strongConnect(v: string): void {
    index.set(v, counter);
    lowlink.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);

    const neighbors = adjacency.get(v) ?? new Set();
    for (const w of neighbors) {
      if (!index.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
      }
    }

    if (lowlink.get(v) === index.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length >= 2 && scc.length <= MAX_RING_SIZE) {
        sccs.push(scc);
      }
    }
  }

  for (const node of nodes) {
    if (!index.has(node)) {
      strongConnect(node);
    }
  }

  return sccs;
}

export interface AnalysisResult {
  companyUpdates: Array<{ gstin: string; fraudScore: number; riskLevel: string }>;
  entityScores: InsertEntityScore[];
  fraudRings: InsertFraudRing[];
}

export function analyzeGSTData(companies: Company[], invoices: Invoice[]): AnalysisResult {
  const gstinSet = new Set(companies.map((c) => c.gstin));

  // Build graph
  const graph = new Map<string, GraphNode>();
  for (const company of companies) {
    graph.set(company.gstin, {
      gstin: company.gstin,
      inDegree: 0,
      outDegree: 0,
      totalInflow: 0,
      totalOutflow: 0,
      neighbors: new Map(),
      reverseNeighbors: new Set(),
      monthlyInvoiceCounts: new Map(),
    });
  }

  const adjacencyValue = new Map<string, Map<string, number>>();
  const adjacencySet = new Map<string, Set<string>>();

  for (const inv of invoices) {
    if (!gstinSet.has(inv.sellerGstin) || !gstinSet.has(inv.buyerGstin)) continue;
    const seller = graph.get(inv.sellerGstin)!;
    const buyer = graph.get(inv.buyerGstin)!;

    seller.outDegree++;
    buyer.inDegree++;
    seller.totalOutflow += inv.invoiceAmount;
    buyer.totalInflow += inv.invoiceAmount;

    // Track neighbors
    const existing = seller.neighbors.get(inv.buyerGstin);
    if (existing) {
      existing.value += inv.invoiceAmount;
      existing.count++;
    } else {
      seller.neighbors.set(inv.buyerGstin, { value: inv.invoiceAmount, count: 1 });
    }
    buyer.reverseNeighbors.add(inv.sellerGstin);

    // Adjacency for cycle detection
    if (!adjacencySet.has(inv.sellerGstin)) adjacencySet.set(inv.sellerGstin, new Set());
    adjacencySet.get(inv.sellerGstin)!.add(inv.buyerGstin);

    if (!adjacencyValue.has(inv.sellerGstin)) adjacencyValue.set(inv.sellerGstin, new Map());
    const curVal = adjacencyValue.get(inv.sellerGstin)!.get(inv.buyerGstin) ?? 0;
    adjacencyValue.get(inv.sellerGstin)!.set(inv.buyerGstin, curVal + inv.invoiceAmount);

    // Monthly tracking
    const month = inv.invoiceDate.substring(0, 7);
    seller.monthlyInvoiceCounts.set(month, (seller.monthlyInvoiceCounts.get(month) ?? 0) + 1);
  }

  // PageRank
  const nodes = [...graph.keys()];
  const pageRanks = computePageRank(adjacencyValue, nodes);
  const prValues = [...pageRanks.values()];
  const prMean = prValues.reduce((a, b) => a + b, 0) / prValues.length;
  const prStd = Math.sqrt(prValues.reduce((s, v) => s + (v - prMean) ** 2, 0) / prValues.length) || 1;

  // Cycle detection using Tarjan's SCC - O(V+E) instead of exponential DFS
  const cycles = findFraudRingSCCs(adjacencySet, nodes);

  // Map cycles to fraud rings
  const fraudRings: InsertFraudRing[] = [];
  const cycleParticipation = new Map<string, number>();
  const cycleEdgeSet = new Set<string>();

  for (const cycle of cycles) {
    const cycleSet = new Set(cycle);
    let totalValue = 0;
    // Sum all edges within the SCC (all internal edges are part of the fraud ring)
    for (const from of cycle) {
      const toMap = adjacencyValue.get(from);
      if (toMap) {
        for (const [to, val] of toMap.entries()) {
          if (cycleSet.has(to)) {
            totalValue += val;
            cycleEdgeSet.add(`${from}→${to}`);
          }
        }
      }
    }
    fraudRings.push({
      cyclePath: JSON.stringify(cycle),
      cycleLength: cycle.length,
      totalCyclingValue: totalValue,
      detectedAt: new Date().toISOString(),
    });
    for (const gstin of cycle) {
      cycleParticipation.set(gstin, (cycleParticipation.get(gstin) ?? 0) + 1);
    }
  }

  // Duplicate invoice detection
  const invoiceSignatures = new Map<string, number>();
  for (const inv of invoices) {
    const sig = `${inv.sellerGstin}|${inv.buyerGstin}|${inv.invoiceDate}|${Math.round(inv.invoiceAmount)}`;
    invoiceSignatures.set(sig, (invoiceSignatures.get(sig) ?? 0) + 1);
  }
  const duplicateCounts = new Map<string, number>();
  for (const inv of invoices) {
    const sig = `${inv.sellerGstin}|${inv.buyerGstin}|${inv.invoiceDate}|${Math.round(inv.invoiceAmount)}`;
    const count = invoiceSignatures.get(sig) ?? 1;
    if (count > 1) {
      duplicateCounts.set(inv.sellerGstin, (duplicateCounts.get(inv.sellerGstin) ?? 0) + (count - 1));
    }
  }

  // Tax mismatch computation
  const taxInputMap = new Map<string, number>();
  const taxOutputMap = new Map<string, number>();
  for (const inv of invoices) {
    taxInputMap.set(inv.buyerGstin, (taxInputMap.get(inv.buyerGstin) ?? 0) + inv.totalTax);
    taxOutputMap.set(inv.sellerGstin, (taxOutputMap.get(inv.sellerGstin) ?? 0) + inv.totalTax);
  }

  // Volume spike computation
  const monthlyCountsByCompany = new Map<string, number[]>();
  for (const [gstin, node] of graph.entries()) {
    const counts = [...node.monthlyInvoiceCounts.values()];
    monthlyCountsByCompany.set(gstin, counts);
  }

  // Compute scores
  const entityScores: InsertEntityScore[] = [];
  const companyUpdates: Array<{ gstin: string; fraudScore: number; riskLevel: string }> = [];

  // For isolation forest approximation: compute Z-scores on features
  const allFeatures: number[][] = [];
  const gstinOrder: string[] = [];

  for (const company of companies) {
    const { gstin } = company;
    const node = graph.get(gstin)!;
    const inputTax = taxInputMap.get(gstin) ?? 0;
    const outputTax = taxOutputMap.get(gstin) ?? 0;
    const cycles = cycleParticipation.get(gstin) ?? 0;
    const dupCount = duplicateCounts.get(gstin) ?? 0;
    const monthlyCounts = monthlyCountsByCompany.get(gstin) ?? [0];
    const avgMonthly = monthlyCounts.reduce((a, b) => a + b, 0) / (monthlyCounts.length || 1);
    const maxMonthly = Math.max(...monthlyCounts, 0);
    const volumeSpike = avgMonthly > 0 ? maxMonthly / avgMonthly : 1;
    const taxMismatch = outputTax > 0 ? (inputTax - outputTax) / outputTax : (inputTax > 0 ? 5 : 0);
    const shellScore = node.inDegree > 5 && node.outDegree === 0 ? 1.0 :
      node.inDegree > 3 && node.outDegree <= 1 ? 0.6 : 0;
    const pr = pageRanks.get(gstin) ?? prMean;
    const prAnomaly = Math.abs((pr - prMean) / prStd);

    allFeatures.push([
      Math.min(Math.max(taxMismatch, -5), 20),
      Math.min(volumeSpike, 30),
      Math.min(dupCount, 20),
      Math.min(cycles, 10),
      shellScore,
      Math.min(prAnomaly, 10),
    ]);
    gstinOrder.push(gstin);
  }

  // Simple anomaly scoring (approximation of Isolation Forest using outlier distance)
  const featureMeans = allFeatures[0].map((_, fi) => {
    const vals = allFeatures.map((f) => f[fi]);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });
  const featureStds = allFeatures[0].map((_, fi) => {
    const vals = allFeatures.map((f) => f[fi]);
    const mean = featureMeans[fi];
    return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1;
  });

  for (let i = 0; i < gstinOrder.length; i++) {
    const gstin = gstinOrder[i];
    const feats = allFeatures[i];
    const [taxMismatch, volumeSpike, dupCount, cycles, shellScore, prAnomaly] = feats;

    // Z-scores
    const zScores = feats.map((v, fi) => (v - featureMeans[fi]) / featureStds[fi]);
    const maxZ = Math.max(...zScores.map(Math.abs));
    const isolationForestLabel = maxZ > 2.0 ? -1 : 1;

    // Composite score (0–100)
    const cycleComponent = Math.min(cycles * 20, 30); // 30%
    const taxComponent = Math.min(Math.max(taxMismatch * 5, 0), 25); // 25%
    const isoComponent = isolationForestLabel === -1 ? 20 : Math.min(maxZ * 5, 10); // 20%
    const spikeComponent = Math.min((volumeSpike - 1) * 3, 15); // 15%
    const shellComponent = shellScore * 10; // 10%

    const compositeScore = Math.min(
      Math.round(cycleComponent + taxComponent + isoComponent + spikeComponent + shellComponent),
      100
    );

    const riskLevel =
      compositeScore >= 86 ? "CRITICAL" :
      compositeScore >= 61 ? "HIGH" :
      compositeScore >= 31 ? "MEDIUM" : "LOW";

    entityScores.push({
      gstin,
      taxMismatchRatio: Math.round(taxMismatch * 1000) / 1000,
      volumeSpikeScore: Math.round(volumeSpike * 100) / 100,
      duplicateInvoiceCount: Math.floor(dupCount),
      cycleParticipation: Math.floor(cycles),
      shellCompanyScore: shellScore,
      pagerankAnomaly: Math.round(prAnomaly * 1000) / 1000,
      isolationForestLabel,
      compositeScore,
    });

    companyUpdates.push({ gstin, fraudScore: compositeScore, riskLevel });
  }

  return { companyUpdates, entityScores, fraudRings };
}

export function getPrimaryRedFlag(score: InsertEntityScore): string {
  const flags: Array<[string, number]> = [
    ["Circular Trading Ring", score.cycleParticipation * 20],
    ["Tax Mismatch", Math.max(score.taxMismatchRatio * 5, 0)],
    ["Shell Company", score.shellCompanyScore * 10],
    ["Volume Spike", Math.max((score.volumeSpikeScore - 1) * 3, 0)],
    ["Duplicate Invoices", score.duplicateInvoiceCount * 2],
    ["Anomalous PageRank", score.pagerankAnomaly],
  ];
  flags.sort((a, b) => b[1] - a[1]);
  if (flags[0][1] === 0) return "None";
  return flags[0][0];
}

export interface GraphData {
  nodes: Array<{
    id: string;
    label: string;
    fraudScore: number;
    riskLevel: string;
    state: string;
    isInFraudRing: boolean;
    cycleParticipation: number;
    totalValue: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    value: number;
    isInFraudRing: boolean;
    invoiceCount: number;
  }>;
  fraudRingEdges: string[];
}

export function buildGraphData(
  companies: Company[],
  invoices: Invoice[],
  entityScores: InsertEntityScore[],
  fraudRings: InsertFraudRing[]
): GraphData {
  // Build set of fraud ring nodes and SCC member sets
  // Since Tarjan SCC returns nodes in arbitrary order (not cycle order),
  // we mark an edge as "in fraud ring" if both its endpoints belong to the same SCC.
  const fraudRingNodeSet = new Set<string>();
  const fraudRingSCCs: Set<string>[] = [];

  for (const ring of fraudRings) {
    const path = JSON.parse(ring.cyclePath) as string[];
    if (path.length > MAX_RING_SIZE) continue; // Skip giant false-positive SCCs
    const sccSet = new Set(path);
    fraudRingSCCs.push(sccSet);
    for (const g of path) fraudRingNodeSet.add(g);
  }

  const scoreMap = new Map(entityScores.map((s) => [s.gstin, s]));
  const companyMap = new Map(companies.map((c) => [c.gstin, c]));

  // Aggregate edges
  const edgeMap = new Map<string, { value: number; count: number }>();
  for (const inv of invoices) {
    const key = `${inv.sellerGstin}→${inv.buyerGstin}`;
    const existing = edgeMap.get(key);
    if (existing) {
      existing.value += inv.invoiceAmount;
      existing.count++;
    } else {
      edgeMap.set(key, { value: inv.invoiceAmount, count: 1 });
    }
  }

  const nodes = companies.map((company) => {
    const score = scoreMap.get(company.gstin);
    const totalValue =
      invoices
        .filter((inv) => inv.sellerGstin === company.gstin || inv.buyerGstin === company.gstin)
        .reduce((s, inv) => s + inv.invoiceAmount, 0);
    return {
      id: company.gstin,
      label: company.companyName,
      fraudScore: score?.compositeScore ?? 0,
      riskLevel: company.riskLevel,
      state: company.state,
      isInFraudRing: fraudRingNodeSet.has(company.gstin),
      cycleParticipation: score?.cycleParticipation ?? 0,
      totalValue,
    };
  });

  const edges = [...edgeMap.entries()].map(([key, data]) => {
    const [source, target] = key.split("→");
    const isInFraudRing = fraudRingSCCs.some(
      (scc) => scc.has(source) && scc.has(target)
    );
    return {
      id: `${source}-${target}`,
      source,
      target,
      value: data.value,
      isInFraudRing,
      invoiceCount: data.count,
    };
  });

  return {
    nodes,
    edges,
    fraudRingEdges: edges.filter((e) => e.isInFraudRing).map((e) => e.id),
  };
}

export function getMonthlyFilings(gstin: string, invoices: Invoice[]): Array<{
  month: string;
  taxIn: number;
  taxOut: number;
  invoiceCount: number;
}> {
  const months = new Map<string, { taxIn: number; taxOut: number; invoiceCount: number }>();
  // Last 12 months
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.set(key, { taxIn: 0, taxOut: 0, invoiceCount: 0 });
  }

  for (const inv of invoices) {
    const month = inv.invoiceDate.substring(0, 7);
    if (!months.has(month)) continue;
    if (inv.buyerGstin === gstin) {
      months.get(month)!.taxIn += inv.totalTax;
      months.get(month)!.invoiceCount++;
    }
    if (inv.sellerGstin === gstin) {
      months.get(month)!.taxOut += inv.totalTax;
    }
  }

  return [...months.entries()].map(([month, data]) => ({
    month,
    ...data,
  }));
}

export function parseCompaniesCSV(csvText: string): { companies: Partial<InsertCompany>[]; errors: string[] } {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return { companies: [], errors: ["CSV must have header + at least 1 row"] };

  const header = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/"/g, ""));
  const companies: Partial<InsertCompany>[] = [];
  const errors: string[] = [];

  const getCol = (row: string[], name: string): string => {
    const idx = header.indexOf(name);
    return idx >= 0 ? (row[idx] ?? "").trim().replace(/"/g, "") : "";
  };

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    const gstin = getCol(row, "gstin") || getCol(row, "gstin_id");
    const companyName = getCol(row, "company_name") || getCol(row, "name");
    const state = getCol(row, "state");
    const registrationDate = getCol(row, "registration_date") || getCol(row, "reg_date") || "2020-01-01";

    if (!gstin || !companyName) {
      errors.push(`Row ${i}: missing required fields (gstin, company_name)`);
      continue;
    }
    companies.push({ gstin, companyName, state: state || "Unknown", registrationDate, fraudScore: 0, riskLevel: "LOW" });
  }
  return { companies, errors };
}

export function parseInvoicesCSV(csvText: string): { invoices: Partial<InsertInvoice>[]; errors: string[] } {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return { invoices: [], errors: ["CSV must have header + at least 1 row"] };

  const header = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/"/g, ""));
  const invoices: Partial<InsertInvoice>[] = [];
  const errors: string[] = [];

  const getCol = (row: string[], name: string): string => {
    const idx = header.indexOf(name);
    return idx >= 0 ? (row[idx] ?? "").trim().replace(/"/g, "") : "";
  };

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    const invoiceId = getCol(row, "invoice_id") || `UPLOAD-${i}`;
    const sellerGstin = getCol(row, "seller_gstin") || getCol(row, "seller");
    const buyerGstin = getCol(row, "buyer_gstin") || getCol(row, "buyer");
    const invoiceDate = getCol(row, "invoice_date") || getCol(row, "date") || "2024-01-01";
    const taxableValue = parseFloat(getCol(row, "taxable_value") || getCol(row, "amount") || "0");
    const totalTax = parseFloat(getCol(row, "total_tax") || "0");
    const invoiceAmount = parseFloat(getCol(row, "invoice_amount") || "0") || taxableValue + totalTax;

    if (!sellerGstin || !buyerGstin) {
      errors.push(`Row ${i}: missing seller_gstin or buyer_gstin`);
      continue;
    }
    invoices.push({
      invoiceId,
      sellerGstin,
      buyerGstin,
      invoiceDate,
      taxableValue,
      cgst: parseFloat(getCol(row, "cgst") || "0"),
      sgst: parseFloat(getCol(row, "sgst") || "0"),
      igst: parseFloat(getCol(row, "igst") || "0"),
      totalTax,
      invoiceAmount,
    });
  }
  return { invoices, errors };
}
