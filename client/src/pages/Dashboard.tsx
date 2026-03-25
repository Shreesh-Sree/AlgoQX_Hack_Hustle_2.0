import React, { useState } from 'react';
import { Header } from '@/components/Header';
import { StatsBar } from '@/components/StatsBar';
import { NetworkGraph } from '@/components/NetworkGraph';
import { FraudLeaderboard } from '@/components/FraudLeaderboard';
import { FraudRingExplorer } from '@/components/FraudRingExplorer';
import { EntityDetailSidebar } from '@/components/EntityDetailSidebar';
import { useGetDashboardStats, useGetTransactionGraph } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export default function Dashboard() {
  const { data: stats } = useGetDashboardStats();
  const { data: graphData, isLoading: isGraphLoading } = useGetTransactionGraph();
  
  const [selectedGstin, setSelectedGstin] = useState<string | null>(null);
  const [highlightRingEdges, setHighlightRingEdges] = useState<string[] | null>(null);

  const handleNodeClick = (gstin: string) => {
    setSelectedGstin(gstin || null);
  };

  const handleSelectRing = (edges: string[]) => {
    if (edges.length === 0) {
      setHighlightRingEdges(null);
    } else {
      setHighlightRingEdges(edges);
      setSelectedGstin(null); // Clear entity selection when viewing a ring
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans overflow-hidden h-screen">
      <Header />
      
      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        {/* Top Stats Bar */}
        <div className="shrink-0">
          <StatsBar stats={stats} />
        </div>

        {/* Main Content Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
          
          {/* Left Panels (Leaderboard + Rings) */}
          <div className="hidden lg:flex lg:col-span-3 flex-col gap-4 min-h-0">
            <div className="flex-1 min-h-0">
              <FraudLeaderboard onSelectGstin={handleNodeClick} selectedGstin={selectedGstin} />
            </div>
            <div className="flex-1 min-h-0">
              <FraudRingExplorer onSelectRing={handleSelectRing} selectedRingId={highlightRingEdges ? 1 : null} />
            </div>
          </div>

          {/* Center Graph Area */}
          <div className="lg:col-span-9 relative rounded-xl overflow-hidden border border-border/50 bg-card/30 backdrop-blur shadow-inner">
            {isGraphLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                <p className="font-mono text-sm animate-pulse">Computing Force Simulation...</p>
              </div>
            ) : graphData ? (
              <NetworkGraph 
                data={graphData} 
                selectedGstin={selectedGstin} 
                onNodeClick={handleNodeClick} 
                highlightRingIds={highlightRingEdges}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                Failed to load graph data
              </div>
            )}
          </div>
          
        </div>
      </main>

      {/* Slide-out Sidebar */}
      <EntityDetailSidebar gstin={selectedGstin} onClose={() => setSelectedGstin(null)} />
    </div>
  );
}
