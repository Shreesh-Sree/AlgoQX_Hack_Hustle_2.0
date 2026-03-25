import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function getRiskColorHex(level: string) {
  switch (level) {
    case "LOW": return "#10b981"; // Emerald-500
    case "MEDIUM": return "#f59e0b"; // Amber-500
    case "HIGH": return "#f97316"; // Orange-500
    case "CRITICAL": return "#e11d48"; // Rose-600
    default: return "#64748b"; // Slate-500
  }
}
