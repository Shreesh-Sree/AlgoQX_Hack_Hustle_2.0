import type { InsertCompany, InsertInvoice } from "../db";

const STATES = [
  "Maharashtra", "Delhi", "Karnataka", "Tamil Nadu", "Gujarat",
  "Rajasthan", "Uttar Pradesh", "West Bengal", "Telangana", "Kerala",
  "Punjab", "Haryana", "Madhya Pradesh", "Andhra Pradesh", "Bihar"
];

const COMPANY_SUFFIXES = [
  "Pvt Ltd", "Ltd", "Enterprises", "Trading Co", "Industries",
  "Solutions", "Exports", "Imports", "Corp", "Associates"
];

const COMPANY_BASES = [
  "Sunrise", "Global", "National", "Premier", "Elite", "Star",
  "Dynamic", "Prime", "Allied", "United", "Vision", "Apex",
  "Crystal", "Silver", "Golden", "Royal", "Crown", "Mega",
  "Metro", "Urban", "Smart", "Tech", "Inno", "Rapid",
  "Future", "Modern", "Classic", "Alpha", "Beta", "Gamma",
  "Delta", "Sigma", "Omega", "Phoenix", "Eagle", "Lion",
  "Tiger", "Falcon", "Hawk", "Arrow", "Shield", "Power",
  "Force", "Boost", "Speed", "Flex", "Core", "Edge",
  "Peak", "Summit", "Horizon", "Pioneer", "Venture", "Pro"
];

function randomGSTIN(state: string, idx: number): string {
  const stateCode = String(STATES.indexOf(state) + 11).padStart(2, "0");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const pan = [
    chars[Math.floor(Math.random() * 26)],
    chars[Math.floor(Math.random() * 26)],
    chars[Math.floor(Math.random() * 26)],
    chars[Math.floor(Math.random() * 26)],
    chars[Math.floor(Math.random() * 26)],
  ].join("") + String(idx + 1000).padStart(4, "0") + chars[Math.floor(Math.random() * 26)];
  return `${stateCode}${pan}1Z${chars[Math.floor(Math.random() * 26)]}`;
}

function randomDate(start: Date, end: Date): string {
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return d.toISOString().split("T")[0];
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function generateSyntheticData(): {
  companies: InsertCompany[];
  invoices: InsertInvoice[];
} {
  const numCompanies = 75;
  const companies: InsertCompany[] = [];
  const gstins: string[] = [];

  const usedNames = new Set<string>();

  for (let i = 0; i < numCompanies; i++) {
    const state = STATES[Math.floor(Math.random() * STATES.length)];
    const base = COMPANY_BASES[i % COMPANY_BASES.length];
    const suffix = COMPANY_SUFFIXES[Math.floor(Math.random() * COMPANY_SUFFIXES.length)];
    let name = `${base} ${suffix}`;
    let nameAttempt = 0;
    while (usedNames.has(name) && nameAttempt < 10) {
      name = `${base} ${i + 1} ${suffix}`;
      nameAttempt++;
    }
    usedNames.add(name);

    const gstin = randomGSTIN(state, i);
    gstins.push(gstin);
    companies.push({
      gstin,
      companyName: name,
      state,
      registrationDate: randomDate(new Date("2018-01-01"), new Date("2022-12-31")),
      fraudScore: 0,
      riskLevel: "LOW",
    });
  }

  const invoices: InsertInvoice[] = [];
  let invoiceCount = 0;

  // --- FRAUD PATTERN 1: Circular Trading Rings (3 rings embedded) ---
  // Ring 1: A→B→C→D→A (4 companies, indices 0-3)
  const ring1Idxs = [0, 1, 2, 3];
  const ring1Amount = 500000 + Math.random() * 500000;
  for (let r = 0; r < ring1Idxs.length; r++) {
    const seller = gstins[ring1Idxs[r]];
    const buyer = gstins[ring1Idxs[(r + 1) % ring1Idxs.length]];
    for (let m = 0; m < 6; m++) {
      const date = `2024-0${m + 1}-15`;
      const tax = ring1Amount * 0.18;
      invoices.push({
        invoiceId: `RING1-${r}-${m}-${invoiceCount++}`,
        sellerGstin: seller,
        buyerGstin: buyer,
        invoiceDate: date,
        taxableValue: ring1Amount,
        cgst: tax * 0.5,
        sgst: tax * 0.5,
        igst: 0,
        totalTax: tax,
        invoiceAmount: ring1Amount + tax,
      });
    }
  }

  // Ring 2: E→F→G→E (3 companies, indices 4-6)
  const ring2Idxs = [4, 5, 6];
  const ring2Amount = 800000 + Math.random() * 700000;
  for (let r = 0; r < ring2Idxs.length; r++) {
    const seller = gstins[ring2Idxs[r]];
    const buyer = gstins[ring2Idxs[(r + 1) % ring2Idxs.length]];
    for (let m = 0; m < 8; m++) {
      const date = `2024-0${(m % 9) + 1}-20`;
      const tax = ring2Amount * 0.18;
      invoices.push({
        invoiceId: `RING2-${r}-${m}-${invoiceCount++}`,
        sellerGstin: seller,
        buyerGstin: buyer,
        invoiceDate: date,
        taxableValue: ring2Amount,
        cgst: tax * 0.5,
        sgst: tax * 0.5,
        igst: 0,
        totalTax: tax,
        invoiceAmount: ring2Amount + tax,
      });
    }
  }

  // Ring 3: H→I→J→K→L→H (5 companies, indices 7-11)
  const ring3Idxs = [7, 8, 9, 10, 11];
  const ring3Amount = 1200000 + Math.random() * 800000;
  for (let r = 0; r < ring3Idxs.length; r++) {
    const seller = gstins[ring3Idxs[r]];
    const buyer = gstins[ring3Idxs[(r + 1) % ring3Idxs.length]];
    for (let m = 0; m < 5; m++) {
      const date = `2024-0${m + 1}-10`;
      const tax = ring3Amount * 0.18;
      invoices.push({
        invoiceId: `RING3-${r}-${m}-${invoiceCount++}`,
        sellerGstin: seller,
        buyerGstin: buyer,
        invoiceDate: date,
        taxableValue: ring3Amount,
        cgst: 0,
        sgst: 0,
        igst: tax,
        totalTax: tax,
        invoiceAmount: ring3Amount + tax,
      });
    }
  }

  // --- FRAUD PATTERN 2: Shell Companies (indices 12-14: only receive, never sell) ---
  const shellIdxs = [12, 13, 14];
  for (const shellIdx of shellIdxs) {
    const buyer = gstins[shellIdx];
    for (let i = 0; i < 12; i++) {
      const seller = gstins[Math.floor(Math.random() * 40) + 20];
      if (seller === buyer) continue;
      const amount = randomBetween(200000, 1500000);
      const tax = amount * 0.18;
      invoices.push({
        invoiceId: `SHELL-${shellIdx}-${i}-${invoiceCount++}`,
        sellerGstin: seller,
        buyerGstin: buyer,
        invoiceDate: randomDate(new Date("2024-01-01"), new Date("2024-12-31")),
        taxableValue: amount,
        cgst: tax * 0.5,
        sgst: tax * 0.5,
        igst: 0,
        totalTax: tax,
        invoiceAmount: amount + tax,
      });
    }
  }

  // --- FRAUD PATTERN 3: Tax Mismatch (indices 15-17: ITC >> Output tax) ---
  const mismatchIdxs = [15, 16, 17];
  for (const mIdx of mismatchIdxs) {
    const company = gstins[mIdx];
    // Heavy buying (large input tax)
    for (let i = 0; i < 10; i++) {
      const seller = gstins[Math.floor(Math.random() * 20) + 30];
      if (seller === company) continue;
      const amount = randomBetween(800000, 2000000);
      const tax = amount * 0.18;
      invoices.push({
        invoiceId: `MISM-B-${mIdx}-${i}-${invoiceCount++}`,
        sellerGstin: seller,
        buyerGstin: company,
        invoiceDate: randomDate(new Date("2024-01-01"), new Date("2024-12-31")),
        taxableValue: amount,
        cgst: tax * 0.5,
        sgst: tax * 0.5,
        igst: 0,
        totalTax: tax,
        invoiceAmount: amount + tax,
      });
    }
    // Very little selling (small output tax)
    for (let i = 0; i < 2; i++) {
      const buyer = gstins[Math.floor(Math.random() * 20) + 50];
      if (buyer === company) continue;
      const amount = randomBetween(50000, 100000);
      const tax = amount * 0.18;
      invoices.push({
        invoiceId: `MISM-S-${mIdx}-${i}-${invoiceCount++}`,
        sellerGstin: company,
        buyerGstin: buyer,
        invoiceDate: randomDate(new Date("2024-01-01"), new Date("2024-12-31")),
        taxableValue: amount,
        cgst: tax * 0.5,
        sgst: tax * 0.5,
        igst: 0,
        totalTax: tax,
        invoiceAmount: amount + tax,
      });
    }
  }

  // --- FRAUD PATTERN 4: Volume Spike (index 18-19: sudden 10x in one month) ---
  for (const spikeIdx of [18, 19]) {
    const company = gstins[spikeIdx];
    // Normal months
    for (let m = 0; m < 10; m++) {
      for (let i = 0; i < 2; i++) {
        const buyer = gstins[Math.floor(Math.random() * 40) + 25];
        if (buyer === company) continue;
        const amount = randomBetween(100000, 300000);
        const tax = amount * 0.18;
        invoices.push({
          invoiceId: `SPIKE-N-${spikeIdx}-${m}-${i}-${invoiceCount++}`,
          sellerGstin: company,
          buyerGstin: buyer,
          invoiceDate: `2024-${String(m + 1).padStart(2, "0")}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`,
          taxableValue: amount,
          cgst: tax * 0.5,
          sgst: tax * 0.5,
          igst: 0,
          totalTax: tax,
          invoiceAmount: amount + tax,
        });
      }
    }
    // Spike month (month 11) - 20+ invoices
    for (let i = 0; i < 22; i++) {
      const buyer = gstins[Math.floor(Math.random() * 40) + 25];
      if (buyer === company) continue;
      const amount = randomBetween(200000, 800000);
      const tax = amount * 0.18;
      invoices.push({
        invoiceId: `SPIKE-S-${spikeIdx}-${i}-${invoiceCount++}`,
        sellerGstin: company,
        buyerGstin: buyer,
        invoiceDate: `2024-11-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`,
        taxableValue: amount,
        cgst: tax * 0.5,
        sgst: tax * 0.5,
        igst: 0,
        totalTax: tax,
        invoiceAmount: amount + tax,
      });
    }
  }

  // --- FRAUD PATTERN 5: Duplicate Invoices (indices 20-21) ---
  for (const dupIdx of [20, 21]) {
    const seller = gstins[dupIdx];
    const buyer = gstins[dupIdx + 2];
    const dupDate = "2024-06-15";
    const dupAmount = randomBetween(500000, 900000);
    const dupTax = dupAmount * 0.18;
    for (let i = 0; i < 5; i++) {
      invoices.push({
        invoiceId: `DUP-${dupIdx}-${i}-${invoiceCount++}`,
        sellerGstin: seller,
        buyerGstin: buyer,
        invoiceDate: dupDate,
        taxableValue: dupAmount,
        cgst: dupTax * 0.5,
        sgst: dupTax * 0.5,
        igst: 0,
        totalTax: dupTax,
        invoiceAmount: dupAmount + dupTax,
      });
    }
  }

  // --- NORMAL TRANSACTIONS (remaining companies) ---
  const normalInvoiceCount = 600 - invoices.length;
  for (let i = 0; i < normalInvoiceCount; i++) {
    const sellerIdx = Math.floor(Math.random() * (numCompanies - 22)) + 22;
    const buyerIdx = Math.floor(Math.random() * (numCompanies - 22)) + 22;
    if (sellerIdx === buyerIdx) continue;
    const seller = gstins[sellerIdx];
    const buyer = gstins[buyerIdx];
    const amount = randomBetween(50000, 500000);
    const isInterState = companies[sellerIdx].state !== companies[buyerIdx].state;
    const tax = amount * 0.18;
    invoices.push({
      invoiceId: `NORM-${i}-${invoiceCount++}`,
      sellerGstin: seller,
      buyerGstin: buyer,
      invoiceDate: randomDate(new Date("2023-04-01"), new Date("2024-12-31")),
      taxableValue: amount,
      cgst: isInterState ? 0 : tax * 0.5,
      sgst: isInterState ? 0 : tax * 0.5,
      igst: isInterState ? tax : 0,
      totalTax: tax,
      invoiceAmount: amount + tax,
    });
  }

  return { companies, invoices };
}
