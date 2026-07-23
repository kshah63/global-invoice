import { MEMBER_STATUS_META, type MemberInvoiceStatus } from "@/lib/constants";

export function MemberStatusBadge({ status }: { status: MemberInvoiceStatus }) {
  const meta = MEMBER_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${meta.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
