import { cn } from "@/lib/cn";
import { STATUS_META, type DashboardStatus } from "@/lib/constants";

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: DashboardStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge className={meta.badge}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}
