"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { bundleIndividualInvoice, unbundleIndividualInvoice } from "@/actions/bundle";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { formatCurrency } from "@/lib/format";
import type { Currency } from "@/lib/constants";

export interface BundledRow {
  individualInvoiceId: string;
  name: string;
  invoiceNumber: string;
  sgdAmount: number;
  rate: number;
  converted: number;
  stale: boolean;
}
export interface EligibleRow {
  invoiceId: string;
  name: string;
  invoiceNumber: string;
  sgdTotal: number;
}

export function BundleIndividualsCard({
  supplierInvoiceId,
  supplierCurrency,
  rateSet,
  periodLabel,
  paid,
  bundled,
  eligible,
}: {
  supplierInvoiceId: string;
  supplierCurrency: Currency;
  rateSet: boolean;
  periodLabel: string;
  paid: boolean;
  bundled: BundledRow[];
  eligible: EligibleRow[];
}) {
  const router = useRouter();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ error?: string }>, key: string) {
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title="Bundled individual invoices"
        description="Individuals paid via this supplier's bulk transfer, converted at this month's rate."
      />
      <CardBody className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        {!rateSet && supplierCurrency !== "SGD" && (
          <Alert tone="warning">
            Set the {supplierCurrency} exchange rate for {periodLabel} in the Reports tab
            before bundling.
          </Alert>
        )}

        {bundled.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing bundled into this invoice yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {bundled.map((b) => (
              <li
                key={b.individualInvoiceId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink-900">{b.name}</span>
                    <span className="font-mono text-xs text-ink-400">{b.invoiceNumber}</span>
                    <Badge className="bg-brand-50 text-brand-700 ring-brand-200">Added by HR</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-ink-500 tnum">
                    {formatCurrency(b.sgdAmount, "SGD")} × {b.rate} ={" "}
                    <span className="font-medium text-ink-700">
                      {formatCurrency(b.converted, supplierCurrency)}
                    </span>
                  </div>
                  {b.stale && !paid && (
                    <div className="mt-0.5 text-xs font-medium text-gold-700">
                      Amount or rate changed since bundling — re-sync to update.
                    </div>
                  )}
                </div>
                {!paid && (
                  <div className="flex items-center gap-2">
                    {b.stale && (
                      <Button
                        type="button"
                        size="sm"
                        variant="brand-soft"
                        loading={busy === `sync-${b.individualInvoiceId}`}
                        onClick={() =>
                          run(
                            () =>
                              bundleIndividualInvoice(b.individualInvoiceId, supplierInvoiceId),
                            `sync-${b.individualInvoiceId}`
                          )
                        }
                      >
                        Re-sync
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      loading={busy === `rm-${b.individualInvoiceId}`}
                      onClick={() =>
                        run(
                          () => unbundleIndividualInvoice(b.individualInvoiceId),
                          `rm-${b.individualInvoiceId}`
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {!paid && (
          <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
            <Select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="w-64"
              disabled={eligible.length === 0 || (supplierCurrency !== "SGD" && !rateSet)}
              aria-label="Individual invoice to add"
            >
              <option value="">
                {eligible.length === 0 ? "No eligible individual invoices" : "Add an individual invoice…"}
              </option>
              {eligible.map((e) => (
                <option key={e.invoiceId} value={e.invoiceId}>
                  {e.name} · {e.invoiceNumber} · {formatCurrency(e.sgdTotal, "SGD")}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              size="sm"
              loading={busy === "add"}
              disabled={!pick || (supplierCurrency !== "SGD" && !rateSet)}
              onClick={() =>
                run(() => bundleIndividualInvoice(pick, supplierInvoiceId), "add").then(() =>
                  setPick("")
                )
              }
            >
              Add
            </Button>
            <span className="text-xs text-ink-400">
              Only approved individual invoices for {periodLabel} are shown.
            </span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
