import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUploadCompanies, useUploadInvoices, useResetToSyntheticData } from '@/lib/api';
import { UploadCloud, FileType, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export function UploadModal({ isOpen, onOpenChange }: { isOpen: boolean, onOpenChange: (open: boolean) => void }) {
  const [companiesFile, setCompaniesFile] = useState<File | null>(null);
  const [invoicesFile, setInvoicesFile] = useState<File | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const uploadComp = useUploadCompanies();
  const uploadInv = useUploadInvoices();
  const resetDemo = useResetToSyntheticData();

  const handleUpload = async () => {
    try {
      if (companiesFile) {
        await uploadComp.mutateAsync({ data: { file: companiesFile } });
      }
      if (invoicesFile) {
        await uploadInv.mutateAsync({ data: { file: invoicesFile } });
      }
      
      toast({
        title: "Upload Successful",
        description: "Data has been ingested and analyzed.",
      });
      
      // Invalidate everything to refresh dashboard
      queryClient.invalidateQueries();
      onOpenChange(false);
      setCompaniesFile(null);
      setInvoicesFile(null);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: "There was an error processing the CSV files.",
      });
    }
  };

  const handleReset = async () => {
    try {
      await resetDemo.mutateAsync();
      toast({
        title: "Demo Reset",
        description: "Synthetic fraud scenarios have been reloaded.",
      });
      queryClient.invalidateQueries();
      onOpenChange(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Reset Failed",
        description: "Could not restore demo data.",
      });
    }
  };

  const FileUploader = ({ label, file, setFile }: { label: string, file: File | null, setFile: (f: File | null) => void }) => (
    <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:bg-secondary/20 transition-colors relative">
      <input 
        type="file" 
        accept=".csv" 
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      {file ? (
        <div className="flex flex-col items-center text-emerald-500">
          <CheckCircle2 className="w-8 h-8 mb-2" />
          <span className="font-medium text-sm text-foreground">{file.name}</span>
          <span className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB</span>
        </div>
      ) : (
        <div className="flex flex-col items-center text-muted-foreground">
          <FileType className="w-8 h-8 mb-2 opacity-50" />
          <span className="font-medium text-sm text-foreground">{label}</span>
          <span className="text-xs mt-1">Drag & drop CSV or click to browse</span>
        </div>
      )}
    </div>
  );

  const isPending = uploadComp.isPending || uploadInv.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-primary" />
            Ingest Real GST Data
          </DialogTitle>
          <DialogDescription>
            Upload audited CSV exports to run them through the AI fraud detection engine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-4">
          <FileUploader label="Upload Companies.csv" file={companiesFile} setFile={setCompaniesFile} />
          <FileUploader label="Upload Invoices.csv" file={invoicesFile} setFile={setInvoicesFile} />
          
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3 mt-4">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-100/80">
              Files are processed entirely in-memory for this session. Data is not permanently stored.
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center sm:justify-between w-full">
          <Button 
            variant="ghost" 
            onClick={handleReset} 
            disabled={resetDemo.isPending || isPending}
            className="text-muted-foreground hover:text-foreground"
          >
            {resetDemo.isPending ? "Resetting..." : "Restore Demo Data"}
          </Button>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button 
              onClick={handleUpload} 
              disabled={(!companiesFile && !invoicesFile) || isPending}
            >
              {isPending ? "Analyzing..." : "Run AI Analysis"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
