import type { Currency } from "@/lib/constants";

/**
 * Indicative FX rate from a free, no-key source (open.er-api.com), cached for
 * 12h. Returns null if unavailable — callers then show the rate-currency amount
 * only. This is deliberately "indicative": the final payout uses the actual
 * rate HR records on the transfer day.
 */
export async function getFxRate(
  from: Currency,
  to: Currency
): Promise<number | null> {
  if (from === to) return 1;
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`, {
      next: { revalidate: 43200 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.[to];
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}
