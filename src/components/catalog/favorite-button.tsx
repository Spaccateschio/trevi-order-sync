import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FavoriteButton({
  active,
  onToggle,
  size = "icon",
  label,
}: {
  active: boolean;
  onToggle: () => void;
  size?: "icon" | "default";
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      size={size === "icon" ? "icon" : "sm"}
      aria-label={active ? "Togli dai preferiti" : "Aggiungi ai preferiti"}
      aria-pressed={active}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Star className={cn("h-4 w-4", active && "fill-current text-accent")} aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </Button>
  );
}
