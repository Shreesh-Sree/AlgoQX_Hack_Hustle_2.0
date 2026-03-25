import React, { useState } from 'react';
import { useGetCompanies } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { type VariantProps } from 'class-variance-authority';
import { AlertCircle, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;
const RISK_VARIANT: Record<string, BadgeVariant> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

interface FraudLeaderboardProps {
  onSelectGstin: (gstin: string) => void;
  selectedGstin: string | null;
}

type SortColumn = 'companyName' | 'gstin' | 'fraudScore' | 'riskLevel';
type SortDir = 'asc' | 'desc';

const RISK_ORDER: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export function FraudLeaderboard({ onSelectGstin, selectedGstin }: FraudLeaderboardProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>('fraudScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const { data: companies, isLoading } = useGetCompanies({ sortBy: 'fraud_score' });

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDir(col === 'fraudScore' || col === 'riskLevel' ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1 text-primary" />
      : <ArrowDown className="w-3 h-3 ml-1 text-primary" />;
  };

  const sorted = [...(companies ?? [])]
    .filter(c =>
      c.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.gstin.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let cmp = 0;
      if (sortColumn === 'fraudScore') {
        cmp = (a.fraudScore ?? 0) - (b.fraudScore ?? 0);
      } else if (sortColumn === 'riskLevel') {
        cmp = (RISK_ORDER[a.riskLevel] ?? 0) - (RISK_ORDER[b.riskLevel] ?? 0);
      } else if (sortColumn === 'companyName') {
        cmp = a.companyName.localeCompare(b.companyName);
      } else if (sortColumn === 'gstin') {
        cmp = a.gstin.localeCompare(b.gstin);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    })
    .slice(0, 20);

  return (
    <Card className="h-full flex flex-col overflow-hidden border-border/50">
      <CardHeader className="pb-3 border-b border-border/50 bg-secondary/20">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            High Risk Entities
          </CardTitle>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search GSTIN or Name..."
            className="w-full bg-background border border-border rounded-md pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {/* Sortable column headers */}
        <div className="flex items-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2 px-1 gap-1">
          <span className="w-6 shrink-0 text-center">#</span>
          <button
            className="flex items-center flex-1 min-w-0 hover:text-foreground transition-colors text-left"
            onClick={() => handleSort('companyName')}
          >
            Name / GSTIN <SortIcon col="companyName" />
          </button>
          <button
            className="flex items-center w-12 hover:text-foreground transition-colors justify-center"
            onClick={() => handleSort('fraudScore')}
          >
            Score <SortIcon col="fraudScore" />
          </button>
          <button
            className="flex items-center w-16 hover:text-foreground transition-colors justify-center"
            onClick={() => handleSort('riskLevel')}
          >
            Risk <SortIcon col="riskLevel" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No risky entities found.</div>
        ) : (
          <div className="divide-y divide-border/30">
            {sorted.map((company, i) => (
              <div
                key={company.gstin}
                onClick={() => onSelectGstin(company.gstin)}
                className={`p-3 cursor-pointer transition-colors flex items-center gap-1 hover:bg-secondary/40 ${selectedGstin === company.gstin ? 'bg-primary/10 border-l-2 border-primary' : 'border-l-2 border-transparent'}`}
              >
                <div className="w-6 text-center text-xs font-mono text-muted-foreground shrink-0">
                  #{i + 1}
                </div>
                <div className="flex-1 min-w-0 truncate">
                  <p className="text-sm font-medium truncate text-foreground">{company.companyName}</p>
                  <p className="text-xs text-muted-foreground font-mono">{company.gstin}</p>
                </div>
                <div className="w-12 text-center shrink-0">
                  <span className="text-base font-bold font-mono tracking-tighter text-foreground">
                    {company.fraudScore}
                  </span>
                </div>
                <div className="w-16 flex justify-center shrink-0">
                  <Badge variant={RISK_VARIANT[company.riskLevel] ?? 'default'} className="text-[10px] px-1 py-0 h-4">
                    {company.riskLevel}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
