"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function PrintToolbar() {
  const router = useRouter();
  return (
    <div className="no-print mb-4 flex items-center justify-between">
      <Button variant="neutral" size="sm" onClick={() => router.back()}>
        ← Back
      </Button>
      <Button size="sm" onClick={() => window.print()}>
        Download / Print PDF
      </Button>
    </div>
  );
}
