import React from 'react';
import { useGetFraudRings } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Repeat, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface FraudRingExplorerProps {
  onSelectRing: (ringEdges: string[]) => void;
  selectedRingId: number | null;
}

export function FraudRingExplorer({ onSelectRing, selectedRingId }: FraudRingExplorerProps) {
  const { data: rings, isLoading } = useGetFraudRings();

  // Build all directed edge ID pairs within the SCC for highlighting.
  // Tarjan SCC node order is not the cycle order, so we generate all pairwise
  // combinations to ensure we match any actual invoice edge in the ring.
  const getEdgesFromPath = (path: string[]) => {
    const edges: string[] = [];
    for (let i = 0; i < path.length; i++) {
      for (let j = 0; j < path.length; j++) {
        if (i !== j) edges.push(`${path[i]}-${path[j]}`);
      }
    }
    return edges;
  };

  return (
    <Card className="h-full flex flex-col overflow-hidden border-border/50">
      <CardHeader className="pb-3 border-b border-border/50 bg-secondary/20">
        <CardTitle className="text-md flex items-center gap-2">
          <Repeat className="w-4 h-4 text-rose-500" />
          Detected Cycles
          <Badge variant="outline" className="ml-auto bg-background">{rings?.length || 0}</Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1,2].map(i => <div key={i} className="h-20 bg-muted/50 rounded-lg animate-pulse" />)}
          </div>
        ) : rings?.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No circular trading detected.</div>
        ) : (
          <div className="divide-y divide-border/30">
            {rings?.map((ring) => {
              const isSelected = selectedRingId === ring.ringId;
              return (
                <div 
                  key={ring.ringId}
                  onClick={() => onSelectRing(isSelected ? [] : getEdgesFromPath(ring.cyclePath))}
                  className={`p-4 cursor-pointer transition-all hover:bg-secondary/40 ${isSelected ? 'bg-rose-500/10 border-l-2 border-rose-500' : 'border-l-2 border-transparent'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="text-sm font-bold text-rose-400">Ring #{ring.ringId}</h4>
                    <span className="text-xs font-mono bg-background px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                      Len: {ring.cycleLength}
                    </span>
                  </div>
                  
                  <div className="text-xs text-muted-foreground mb-3 flex flex-wrap gap-1 items-center">
                    {ring.companyNames.map((name, i) => (
                      <React.Fragment key={i}>
                        <span className="truncate max-w-[80px] inline-block" title={name}>{name.split(' ')[0]}</span>
                        {i < ring.companyNames.length - 1 && <ChevronRight className="w-3 h-3 text-border shrink-0" />}
                      </React.Fragment>
                    ))}
                  </div>
                  
                  <div className="flex justify-between items-end mt-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Cycling Value</span>
                    <span className="text-sm font-mono font-semibold text-foreground">
                      {formatCurrency(ring.totalCyclingValue)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
