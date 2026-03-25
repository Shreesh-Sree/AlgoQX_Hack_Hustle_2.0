import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md text-center space-y-6 bg-card p-8 rounded-2xl border border-border shadow-2xl">
        <div className="flex justify-center">
          <AlertCircle className="h-16 w-16 text-destructive" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground font-display">404</h1>
          <p className="mt-2 text-muted-foreground">
            The dashboard panel you are looking for does not exist.
          </p>
        </div>
        <Link href="/" className="inline-block mt-4">
          <Button variant="default" className="w-full sm:w-auto">
            Return to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
