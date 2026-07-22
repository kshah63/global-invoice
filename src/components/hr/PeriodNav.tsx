import { MONTH_NAMES } from "@/lib/constants";
import { Button } from "@/components/ui/Button";

/**
 * Server-rendered period picker — a plain GET form so it works without JS.
 */
export function PeriodNav({
  basePath,
  year,
  month,
  yearRange = 2,
}: {
  basePath: string;
  year: number;
  month: number;
  yearRange?: number;
}) {
  const nowYear = year;
  const years: number[] = [];
  for (let y = nowYear - yearRange; y <= nowYear + 1; y++) years.push(y);

  return (
    <form method="get" action={basePath} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">Month</label>
        <select
          name="month"
          defaultValue={month}
          className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm"
        >
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">Year</label>
        <select
          name="year"
          defaultValue={year}
          className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="neutral">
        Go
      </Button>
    </form>
  );
}
