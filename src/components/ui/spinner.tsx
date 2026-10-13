import { cn } from "./cn";

/**
 * A spinning ring. `lg` is the 44px one for a full-card wait (signing in);
 * `sm` sits inline. Decorative: put the words that explain the wait beside it
 * (in a role="status" element), as this renders nothing for a screen reader.
 * Stops turning for people who ask for reduced motion.
 */
export function Spinner({ size = "sm", className }: { size?: "sm" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block rounded-full border-soft border-t-accent motion-safe:animate-spin",
        size === "lg" ? "size-11 border-4" : "size-4 border-2",
        className,
      )}
    />
  );
}
