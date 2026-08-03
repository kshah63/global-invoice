"use client";

import { Button } from "@/components/ui/Button";

/**
 * Triggers the browser's print dialog (which also offers "Save as PDF").
 * Marked no-print so it never appears in the printout itself.
 */
export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <Button
      type="button"
      variant="neutral"
      className="no-print"
      onClick={() => window.print()}
    >
      {label}
    </Button>
  );
}
