import React from 'react';
import { useGetCompanyDetail } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { type VariantProps } from 'class-variance-authority';
import { formatCurrency } from '@/lib/utils';

import { X, ExternalLink, ShieldAlert, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend } from 'recharts';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;
const RISK_VARIANT: Record<string, BadgeVariant> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

interface EntityDetailSidebarProps {
  gstin: string | null;
  onClose: () => void;
}

export function EntityDetailSidebar({ gstin, onClose }: EntityDetailSidebarProps) {
  const { data: company, isLoading } = useGetCompanyDetail(gstin || "", {
    query: { enabled: !!gstin }
  });

  return (
    <AnimatePresence>
      {gstin && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed inset-y-0 right-0 w-full max-w-md bg-card/95 backdrop-blur-xl border-l border-border shadow-2xl z-40 overflow-y-auto"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold font-display">Entity Analysis</h2>
              <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full" aria-label="Close entity sidebar">
                <X className="w-5 h-5" />
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-6 animate-pulse">
                <div className="h-24 bg-muted rounded-xl"></div>
                <div className="h-64 bg-muted rounded-xl"></div>
                <div className="h-48 bg-muted rounded-xl"></div>
              </div>
            ) : company ? (
              <div className="space-y-6">
                {/* Header Profile */}
                <div className="p-5 rounded-xl bg-secondary/30 border border-border relative overflow-hidden">
                  <div className={`absolute top-0 right-0 w-24 h-24 blur-3xl opacity-20 ${{ LOW: 'bg-emerald-500', MEDIUM: 'bg-amber-500', HIGH: 'bg-orange-500', CRITICAL: 'bg-rose-600' }[company.riskLevel] ?? 'bg-slate-500'}`} />
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-bold text-foreground">{company.companyName}</h3>
                      <p className="text-sm font-mono text-muted-foreground">{company.gstin}</p>
                    </div>
                    <Badge variant={RISK_VARIANT[company.riskLevel] ?? 'default'} className="uppercase">
                      {company.riskLevel} RISK
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs block">State</span>
                      <span className="font-medium">{company.state}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs block">Registration</span>
                      <span className="font-medium">{new Date(company.registrationDate).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {company.primaryRedFlag && (
                    <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-bold text-destructive uppercase block">Primary Red Flag</span>
                        <span className="text-sm text-foreground">{company.primaryRedFlag}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Fraud Profile Radar */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-primary" /> Risk Vector Profile
                  </h4>
                  <Card className="bg-transparent border-border/50 p-2">
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                          { subject: 'Tax Mismatch', A: company.featureScores.taxMismatchRatio * 100 },
                          { subject: 'Volume Spikes', A: company.featureScores.volumeSpikeScore * 100 },
                          { subject: 'Duplicates', A: Math.min(100, company.featureScores.duplicateInvoiceCount * 10) },
                          { subject: 'Cycle Rings', A: company.featureScores.cycleParticipation * 100 },
                          { subject: 'Shell Risk', A: company.featureScores.shellCompanyScore * 100 },
                          { subject: 'Network Anomaly', A: company.featureScores.pagerankAnomaly * 100 },
                        ]}>
                          <PolarGrid stroke="hsl(var(--border))" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                          <Radar name="Risk Score" dataKey="A" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>

                {/* Transaction History Bar Chart */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">12-Month Tax Filings</h4>
                  <Card className="bg-transparent border-border/50 p-4">
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={company.monthlyFilings}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v/1000}k`} />
                          <RechartsTooltip 
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                            formatter={(value: number) => formatCurrency(value)}
                          />
                          <Bar dataKey="taxIn" fill="hsl(var(--primary))" name="ITC Claimed (In)" radius={[2, 2, 0, 0]} />
                          <Bar dataKey="taxOut" fill="hsl(var(--risk-medium))" name="Tax Paid (Out)" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>

                {/* Connections */}
                {company.connectedEntities && company.connectedEntities.length > 0 && (
                  <div className="space-y-3 pb-8">
                    <h4 className="text-sm font-semibold">Direct Connections</h4>
                    <div className="flex flex-wrap gap-2">
                      {company.connectedEntities.map(conn => (
                        <Badge key={conn} variant="outline" className="font-mono text-xs bg-secondary/50">
                          {conn}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="text-center text-muted-foreground py-12">
                Entity not found or failed to load.
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
