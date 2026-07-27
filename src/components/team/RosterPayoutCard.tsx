import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import { ROSTER_ROLE_LABELS, type Currency } from "@/lib/constants";

export interface PayoutRow {
  name: string;
  role: string | null;
  bank: string | null;
  total: number;
}

function roleLabel(role: string | null) {
  if (!role) return null;
  return (ROSTER_ROLE_LABELS as Record<string, string>)[role] ?? role;
}

/**
 * Leader-facing payout aid: each roster person's amount on this invoice plus
 * their bank details, so the leader can make transfers. Not shown on the
 * invoice sent to HR.
 */
export function RosterPayoutCard({
  rows,
  currency,
}: {
  rows: PayoutRow[];
  currency: Currency;
}) {
  if (rows.length === 0) return null;
  return (
    <Card className="mb-6">
      <CardHeader
        title="Roster payout details"
        description="Each person's amount on this invoice and their bank details, for making transfers."
      />
      <CardBody className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                <th className="px-5 py-3 font-semibold">Person</th>
                <th className="px-5 py-3 text-right font-semibold">Amount</th>
                <th className="px-5 py-3 font-semibold">Bank details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((r, i) => (
                <tr key={i} className="align-top">
                  <td className="px-5 py-3">
                    <div className="font-medium text-ink-900">{r.name}</div>
                    {roleLabel(r.role) && (
                      <div className="text-xs text-ink-400">{roleLabel(r.role)}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right tnum">
                    {formatCurrency(r.total, currency)}
                  </td>
                  <td className="whitespace-pre-line px-5 py-3 text-ink-600">
                    {r.bank || <span className="text-ink-400">Not set</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
