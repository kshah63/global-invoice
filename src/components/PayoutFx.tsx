import { formatCurrency, formatNumber } from "@/lib/format";
import type { Currency } from "@/lib/constants";

/**
 * Small note shown when a person's payout currency differs from their rate
 * currency: the actual recorded amount if HR has entered a rate, otherwise an
 * indicative amount at the live rate.
 */
export function PayoutFx({
  total,
  rateCurrency,
  paymentCurrency,
  fxRate,
  actualRate,
  actualDate,
  className = "",
}: {
  total: number;
  rateCurrency: Currency;
  paymentCurrency: Currency | null;
  fxRate: number | null; // live indicative rate
  actualRate?: number | null; // rate HR recorded
  actualDate?: string | null;
  className?: string;
}) {
  if (!paymentCurrency || paymentCurrency === rateCurrency) return null;

  const box = `rounded-xl bg-ink-50 px-4 py-3 text-xs text-ink-500 ${className}`;

  if (actualRate != null && actualRate > 0) {
    return (
      <div className={box}>
        Paid in {paymentCurrency}:{" "}
        <span className="font-medium text-ink-700">
          {formatCurrency(total * actualRate, paymentCurrency)}
        </span>{" "}
        at the recorded rate ({formatNumber(actualRate)}
        {actualDate ? `, ${actualDate}` : ""}).
      </div>
    );
  }
  if (fxRate != null && fxRate > 0) {
    return (
      <div className={box}>
        Paid in {paymentCurrency}: ≈{" "}
        <span className="font-medium text-ink-700">
          {formatCurrency(total * fxRate, paymentCurrency)}
        </span>{" "}
        at today&apos;s indicative rate. The final amount depends on the exchange rate on
        the transfer day.
      </div>
    );
  }
  return (
    <div className={box}>
      Paid in {paymentCurrency}. The converted amount is confirmed at the exchange rate on
      the transfer day.
    </div>
  );
}
