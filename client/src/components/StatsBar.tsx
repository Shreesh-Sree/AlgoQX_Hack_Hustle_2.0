import React from 'react';
import { DashboardStats } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { Activity, AlertTriangle, ShieldAlert, Building2 } from 'lucide-react';
import { motion } from 'framer-motion';

export function StatsBar({ stats }: { stats?: DashboardStats }) {
  if (!stats) return <div className="h-24 animate-pulse bg-muted rounded-xl" />;

  const items = [
    {
      title: "Entities Scanned",
      value: formatNumber(stats.totalEntities),
      icon: <Building2 className="w-5 h-5 text-primary" />,
      desc: `${formatNumber(stats.totalInvoices)} invoices`
    },
    {
      title: "Fraud Rings Detected",
      value: formatNumber(stats.fraudRingsDetected),
      icon: <Activity className="w-5 h-5 text-rose-500" />,
      desc: "Circular cycles found"
    },
    {
      title: "High Risk Entities",
      value: formatNumber(stats.highRiskEntities + stats.criticalEntities),
      icon: <AlertTriangle className="w-5 h-5 text-orange-500" />,
      desc: `${formatNumber(stats.criticalEntities)} critical flags`
    },
    {
      title: "Suspicious Value",
      value: formatCurrency(stats.totalSuspiciousValue),
      icon: <ShieldAlert className="w-5 h-5 text-amber-500" />,
      desc: "Potential tax loss"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
        >
          <Card className="hover:border-primary/30 transition-colors bg-card/80 backdrop-blur overflow-hidden relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardContent className="p-5 flex items-start justify-between relative z-10">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{item.title}</p>
                <h3 className="text-2xl font-bold font-display tracking-tight text-foreground">{item.value}</h3>
                <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
              </div>
              <div className="p-3 bg-secondary/50 rounded-lg border border-border/50">
                {item.icon}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
