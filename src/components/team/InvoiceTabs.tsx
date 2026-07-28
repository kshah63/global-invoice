"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export interface InvoiceTab {
  key: string;
  label: string;
  content: React.ReactNode;
}

/**
 * Lightweight in-page tabs for the supplier invoice view. All panels stay
 * mounted (inactive ones are just hidden) so switching tabs never drops
 * unsaved edits in the invoice editor.
 */
export function InvoiceTabs({ tabs }: { tabs: InvoiceTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);

  return (
    <div>
      <div
        role="tablist"
        className="mb-6 flex gap-1 overflow-x-auto border-b border-ink-200 pb-2"
      >
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-brand-600 text-white shadow-card"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" hidden={t.key !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
