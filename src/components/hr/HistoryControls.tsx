"use client";

import { useRouter } from "next/navigation";
import { MONTH_NAMES } from "@/lib/constants";
import { Select } from "@/components/ui/Field";

export function HistoryControls({
  fromYear,
  fromMonth,
  toYear,
  toMonth,
  sgd,
  years,
}: {
  fromYear: number;
  fromMonth: number;
  toYear: number;
  toMonth: number;
  sgd: boolean;
  years: number[];
}) {
  const router = useRouter();

  function go(next: Partial<{
    fromYear: number;
    fromMonth: number;
    toYear: number;
    toMonth: number;
    sgd: boolean;
  }>) {
    const p = new URLSearchParams();
    p.set("fromYear", String(next.fromYear ?? fromYear));
    p.set("fromMonth", String(next.fromMonth ?? fromMonth));
    p.set("toYear", String(next.toYear ?? toYear));
    p.set("toMonth", String(next.toMonth ?? toMonth));
    if (next.sgd ?? sgd) p.set("sgd", "1");
    router.push(`/hr/reports/monthly?${p.toString()}`);
  }

  const monthOpts = MONTH_NAMES.map((name, i) => (
    <option key={i + 1} value={i + 1}>
      {name}
    </option>
  ));
  const yearOpts = years.map((y) => (
    <option key={y} value={y}>
      {y}
    </option>
  ));

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wider text-ink-500">From</div>
        <div className="flex gap-2">
          <div className="w-32">
            <Select
              aria-label="From month"
              value={fromMonth}
              onChange={(e) => go({ fromMonth: Number(e.target.value) })}
            >
              {monthOpts}
            </Select>
          </div>
          <div className="w-24">
            <Select
              aria-label="From year"
              value={fromYear}
              onChange={(e) => go({ fromYear: Number(e.target.value) })}
            >
              {yearOpts}
            </Select>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wider text-ink-500">To</div>
        <div className="flex gap-2">
          <div className="w-32">
            <Select
              aria-label="To month"
              value={toMonth}
              onChange={(e) => go({ toMonth: Number(e.target.value) })}
            >
              {monthOpts}
            </Select>
          </div>
          <div className="w-24">
            <Select
              aria-label="To year"
              value={toYear}
              onChange={(e) => go({ toYear: Number(e.target.value) })}
            >
              {yearOpts}
            </Select>
          </div>
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700">
        <input
          type="checkbox"
          checked={sgd}
          onChange={(e) => go({ sgd: e.target.checked })}
          className="h-4 w-4 accent-brand-600"
        />
        Convert all to SGD
      </label>
    </div>
  );
}
