"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./Button";

type Variant = React.ComponentProps<typeof Button>["variant"];
type Size = React.ComponentProps<typeof Button>["size"];

/**
 * Submit button that shows a pending spinner (via useFormStatus) and can ask
 * for confirmation before submitting. Must be rendered inside a <form>.
 */
export function SubmitButton({
  children,
  variant,
  size,
  fullWidth,
  confirm,
  className,
  name,
  value,
}: {
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  confirm?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      loading={pending}
      className={className}
      name={name}
      value={value}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </Button>
  );
}
