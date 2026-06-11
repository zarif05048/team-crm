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
        "flex shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold uppercase text-emerald-700",
        "h-10 w-10",
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
