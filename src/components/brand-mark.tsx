import { cn } from "@/lib/utils";

/**
 * Segno di brand. Usa solo token di tema, così il branding
 * potrà diventare configurabile per azienda.
 */
export function BrandMark({
  className,
  showName = true,
  tone = "light",
}: {
  className?: string;
  showName?: boolean;
  tone?: "light" | "dark";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent font-display text-base font-bold text-accent-foreground">
        TF
      </span>
      {showName ? (
        <span
          className={cn(
            "font-display text-lg font-semibold leading-none tracking-tight",
            tone === "dark" ? "text-sidebar-foreground" : "text-foreground",
          )}
        >
          Trevi Fruit
        </span>
      ) : null}
    </span>
  );
}
