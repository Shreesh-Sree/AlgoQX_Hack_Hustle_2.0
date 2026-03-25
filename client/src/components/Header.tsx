import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { Download, Upload, Shield, LogOut, Loader2 } from 'lucide-react';
import { UploadModal } from './UploadModal';
import { useExportReport } from '@/lib/api';

export function Header() {
  const { user, isAuthenticated, isLoading: authLoading, login, logout } = useAuth();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const { refetch: fetchReport, isFetching: isExporting } = useExportReport({ query: { enabled: false } });

  const handleExport = async () => {
    const res = await fetchReport();
    if (res.data) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gst-fraud-audit-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg leading-tight">GST Fraud AI</h1>
              <p className="text-[10px] text-primary font-mono tracking-widest uppercase opacity-80">Auditor Dashboard v2.4</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setIsUploadOpen(true)} className="hidden md:flex">
              <Upload className="w-4 h-4 mr-2" />
              Ingest Data
            </Button>
            
            <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
              {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Export Audit
            </Button>

            <div className="w-px h-6 bg-border mx-2" />

            {authLoading ? (
              <div className="w-20 h-9 animate-pulse bg-muted rounded-md" />
            ) : isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground hidden sm:block">
                  {user.firstName || user.email?.split('@')[0]}
                </span>
                <Button variant="ghost" size="icon" onClick={() => logout()} title="Logout" className="text-muted-foreground hover:text-destructive">
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button onClick={() => login()} size="sm" variant="secondary">
                Auditor Login
              </Button>
            )}
          </div>

        </div>
      </header>
      <UploadModal isOpen={isUploadOpen} onOpenChange={setIsUploadOpen} />
    </>
  );
}
