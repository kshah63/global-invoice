import type { Currency } from "@/lib/constants";

/**
 * Shown on a non-SGD invoice: MathVision transfers in SGD, converted at OCBC's
 * rate on the transfer day. No indicative figure — the exact SGD amount is only
 * known on the day.
 */
export function TransferNote({
  currency,
  className = "",
}: {
  currency: Currency;
  className?: string;
}) {
  if (currency === "SGD") return null;
  return (
    <div className={`rounded-xl bg-ink-50 px-4 py-3 text-xs text-ink-500 ${className}`}>
      Payment is sent in <span className="font-medium text-ink-700">SGD</span>, converted from{" "}
      {currency} at OCBC&apos;s exchange rate on the date of transfer.
    </div>
  );
}
