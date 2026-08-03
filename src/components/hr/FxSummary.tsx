"use client";

import { useMemo, useState } from "react";
import { saveReportFxRates } from "@/actions/fx";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { formatCurrency } from "@/lib/format";
import type { Currency } from "@/lib/constants";

export interface CurrencyTotal {
  currency: Currency;
  total: number;
}

export function FxSummary({
  year,
  month,
  entries,
  initialRates,
}: {
  year: number;
  month: number;
  entries: CurrencyTotal[]; // SGD first, then others
  initialRates: Partial<Record<Currency, number>>; // units per SGD
}) {
  const nonSgd = entries.filter((e) => e.currency !== "SGD");
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const r: Record<string, string> = {};
    nonSgd.forEach((e) => {
      const v = initialRates[e.currency];
      r[e.currency] = v ? String(v) : "";
    });
    return r;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { sgdTotal, missing } = useMemo(() => {
    let sgd = 0;
    const missing: Currency[] = [];
    entries.forEach((e) => {
      if (e.currency === "SGD") {
        sgd += e.total;
        return;
      }
      const rate = Number(rates[e.currency]) || 0;
      if (rate > 0) sgd += e.total / rate;
      else if (e.total > 0) missing.push(e.currency);
    });
    return { sgdTotal: sgd, missing };
  }, [entries, rates]);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const payload = nonSgd
      .map((e) => ({ currency: e.currency, unitsPerSgd: Number(rates[e.currency]) || 0 }))
      .filter((r) => r.unitsPerSgd > 0);
    const res = await saveReportFxRates(year, month, payload);
    setSaving(false);
    if (res.error) setError(res.error);
    else setSaved(true);
  }

  return (
    <div className="mb-6 space-y-4">
      {/* Per-currency totals + combined SGD */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {entries.map((e) => (
          <div key={e.currency} className="card px-5 py-4">
            <div className="text-xs uppercase tracking-wider text-ink-400">Total · {e.currency}</div>
            <div className="mt-1 text-2xl font-semibold tnum text-ink-900">
              {formatCurrency(e.total, e.currency)}
            </div>
          </div>
        ))}
        <div className="card border-brand-200 bg-brand-50/60 px-5 py-4">
          <div className="text-xs uppercase tracking-wider text-brand-500">Total · SGD (converted)</div>
          <div className="mt-1 text-2xl font-semibold tnum text-brand-800">
            {formatCurrency(sgdTotal, "SGD")}
          </div>
          {missing.length > 0 && (
            <div className="mt-1 text-xs text-gold-700">
              Set {missing.join(" & ")} rate{missing.length > 1 ? "s" : ""} to include
            </div>
          )}
        </div>
      </div>

      {/* Rate editor (hidden from the printout) */}
      {nonSgd.length > 0 && (
        <div className="no-print rounded-xl border border-ink-200 bg-white p-4">
          <div className="mb-3 text-sm font-medium text-ink-700">
            Exchange rates for this month
          </div>
          <div className="flex flex-wrap items-end gap-4">
            {nonSgd.map((e) => (
              <div key={e.currency} className="flex shrink-0 items-center gap-2">
                <span className="whitespace-nowrap text-sm text-ink-600">1&nbsp;SGD&nbsp;=</span>
                <Input
                  type="number"
                  min="0"
                  step="0.0001"
                  inputMode="decimal"
                  className="w-28 shrink-0 text-right"
                  value={rates[e.currency] ?? ""}
                  onChange={(ev) => {
                    setSaved(false);
                    setRates((r) => ({ ...r, [e.currency]: ev.target.value }));
                  }}
                  placeholder="0.00"
                />
                <span className="text-sm font-medium text-ink-700">{e.currency}</span>
              </div>
            ))}
            <Button type="button" size="sm" onClick={onSave} loading={saving}>
              Save rates
            </Button>
            {saved && <span className="text-sm text-emerald-600">Saved.</span>}
          </div>
          {error && (
            <Alert tone="danger" className="mt-3">
              {error}
            </Alert>
          )}
          <p className="mt-2 text-xs text-ink-400">
            Saved for {monthName(month)} {year} — kept when you switch months.
          </p>
        </div>
      )}
    </div>
  );
}

function monthName(m: number): string {
  return [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][m - 1] ?? String(m);
}
