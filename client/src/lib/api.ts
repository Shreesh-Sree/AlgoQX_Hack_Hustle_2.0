/// <reference types="vite/client" />
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, init);
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalEntities: number;
  fraudRingsDetected: number;
  highRiskEntities: number;
  criticalEntities: number;
  totalSuspiciousValue: number;
  totalInvoices: number;
  averageFraudScore: number;
  dataSource: string;
}

export interface CompanySummary {
  gstin: string;
  companyName: string;
  state: string;
  fraudScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  totalInvoicesAsSeller: number;
  totalInvoicesAsBuyer: number;
  totalValueAsSeller: number;
  totalValueAsBuyer: number;
  primaryRedFlag: string;
  isInFraudRing: boolean;
}

export interface FeatureScores {
  taxMismatchRatio: number;
  volumeSpikeScore: number;
  duplicateInvoiceCount: number;
  cycleParticipation: number;
  shellCompanyScore: number;
  pagerankAnomaly: number;
  isolationForestLabel: number;
  compositeScore: number;
}

export interface CompanyDetail extends CompanySummary {
  registrationDate: string;
  featureScores: FeatureScores;
  monthlyFilings: { month: string; value: number }[];
  recentInvoices: {
    invoiceId: string;
    counterpartyGstin: string;
    counterpartyName: string;
    direction: "sent" | "received";
    invoiceDate: string;
    invoiceAmount: number;
  }[];
  connectedEntities: string[];
  fraudRingIds: number[];
}

export interface GraphNode {
  id: string;
  companyName: string;
  fraudScore: number;
  riskLevel: string;
  isInFraudRing: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  invoiceAmount: number;
  isInFraudRing: boolean;
}

export interface TransactionGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface FraudRing {
  ringId: number;
  cyclePath: string[];
  cycleLength: number;
  totalCyclingValue: number;
  detectedAt: string;
  companyNames: string[];
}

export interface UploadResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useGetDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiFetch("/dashboard-stats"),
  });
}

export function useGetTransactionGraph() {
  return useQuery<TransactionGraph>({
    queryKey: ["transaction-graph"],
    queryFn: () => apiFetch("/transaction-graph"),
    staleTime: 60_000,
  });
}

export function useGetCompanies(params?: { sortBy?: string; riskLevel?: string; search?: string }) {
  const qs = params ? new URLSearchParams(params as Record<string, string>).toString() : "";
  return useQuery<CompanySummary[]>({
    queryKey: ["companies", params],
    queryFn: () => apiFetch(`/companies${qs ? `?${qs}` : ""}`),
  });
}

export function useGetCompanyDetail(
  gstin: string,
  options?: { query?: { enabled?: boolean } }
) {
  return useQuery<CompanyDetail>({
    queryKey: ["company", gstin],
    queryFn: () => apiFetch(`/companies/${gstin}`),
    enabled: options?.query?.enabled !== false && !!gstin,
  });
}

export function useGetFraudRings() {
  return useQuery<FraudRing[]>({
    queryKey: ["fraud-rings"],
    queryFn: () => apiFetch("/fraud-rings"),
  });
}

/** Lazy query — call refetch() to trigger a JSON download. */
export function useExportReport(options?: { query?: { enabled?: boolean } }) {
  return useQuery<null>({
    queryKey: ["export-report"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/export-report`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gst-fraud-report-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return null;
    },
    enabled: options?.query?.enabled ?? false,
    retry: false,
  });
}

export function useUploadCompanies() {
  const qc = useQueryClient();
  return useMutation<UploadResult, Error, { data: { file: File } }>({
    mutationFn: async ({ data }) => {
      const form = new FormData();
      form.append("file", data.file);
      return apiFetch("/upload-companies", { method: "POST", body: form });
    },
    onSuccess: () => { qc.invalidateQueries(); },
  });
}

export function useUploadInvoices() {
  const qc = useQueryClient();
  return useMutation<UploadResult, Error, { data: { file: File } }>({
    mutationFn: async ({ data }) => {
      const form = new FormData();
      form.append("file", data.file);
      return apiFetch("/upload-invoices", { method: "POST", body: form });
    },
    onSuccess: () => { qc.invalidateQueries(); },
  });
}

export function useResetToSyntheticData() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, void>({
    mutationFn: () => apiFetch("/reset-synthetic", { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries(); },
  });
}
