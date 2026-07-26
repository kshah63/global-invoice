import { cn } from "@/lib/cn";

/**
 * MathVision monogram — the real MV mark: an indigo "M" over a white "V"
 * chevron, on the brand orange (rounded for the app tile). Vector paths taken
 * straight from the supplied logo, so it stays crisp at any size.
 */
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
      viewBox="0 0 850.394 850.39"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <rect width="850.394" height="850.39" rx="150" fill="#f05a2b" />
      <path
        transform="matrix(1,0,0,-1,137.1235,44.551637)"
        d="M0 0V-369.717H82.061V-216.476L288.097-460.159 492.367-216.476V-375.746H575.458V0L288.097-305.596Z"
        fill="#2e3192"
      />
      <path
        transform="matrix(1,0,0,-1,425.2202,806.6312)"
        d="M0 0-288.097 355.451V497.514L0 167.651 287.361 497.514V355.451Z"
        fill="#ffffff"
      />
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
            "font-sans text-lg font-bold tracking-tight",
            invert ? "text-white" : "text-ink-900"
          )}
        >
          MathVision
        </div>
        {subtitle && (
          <div
            className={cn(
              "text-[0.7rem] font-semibold uppercase tracking-[0.18em]",
              invert ? "text-gold-300" : "text-ink-400"
            )}
          >
            Global Online
          </div>
        )}
      </div>
    </div>
  );
}
