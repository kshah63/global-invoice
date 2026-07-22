import { cn } from "@/lib/cn";

/** MathVision monogram — a rounded tile with an ascending "insight" curve. */
export function BrandMark({
  className,
  size = 36,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="11" fill="#163d6e" />
      <rect width="40" height="40" rx="11" fill="url(#mv-grad)" fillOpacity="0.5" />
      <path
        d="M9 27.5 L16.5 15.5 L21 22 L28 11.5"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="28" cy="11.5" r="3" fill="#d6a32e" />
      <defs>
        <linearGradient id="mv-grad" x1="0" y1="0" x2="40" y2="40">
          <stop stopColor="#3066a6" />
          <stop offset="1" stopColor="#0d223d" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function BrandWordmark({
  className,
  subtitle = true,
  invert = false,
}: {
  className?: string;
  subtitle?: boolean;
  invert?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <div className="leading-tight">
        <div
          className={cn(
            "font-serif text-lg font-semibold tracking-tight",
            invert ? "text-white" : "text-ink-900"
          )}
        >
          MathVision
        </div>
        {subtitle && (
          <div
            className={cn(
              "text-[0.7rem] font-medium uppercase tracking-wider",
              invert ? "text-brand-200" : "text-ink-400"
            )}
          >
            Global Online
          </div>
        )}
      </div>
    </div>
  );
}
