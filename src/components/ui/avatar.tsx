import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

export function Avatar({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-accent-400/30 text-sm font-semibold uppercase text-brand-700 ring-1 ring-inset ring-brand-200/60",
        "h-10 w-10",
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
