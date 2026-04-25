import * as RSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Select = RSelect.Root;
export const SelectValue = RSelect.Value;

export const SelectTrigger = forwardRef<
  HTMLButtonElement,
  RSelect.SelectTriggerProps & { className?: string }
>(({ className, children, ...props }, ref) => (
  <RSelect.Trigger
    ref={ref}
    className={cn(
      "flex h-12 w-full items-center justify-between rounded-lg border border-line-secondary bg-bg-primary px-lg text-title text-fg-primary",
      "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft",
      className,
    )}
    {...props}
  >
    {children}
    <RSelect.Icon>
      <ChevronDown className="h-4 w-4 opacity-60" />
    </RSelect.Icon>
  </RSelect.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

export function SelectContent({ children }: { children: React.ReactNode }) {
  return (
    <RSelect.Portal>
      <RSelect.Content
        position="popper"
        sideOffset={4}
        className="z-50 max-h-[300px] overflow-hidden rounded-lg border border-line-tertiary bg-bg-primary shadow-lg"
      >
        <RSelect.Viewport className="p-xs">{children}</RSelect.Viewport>
      </RSelect.Content>
    </RSelect.Portal>
  );
}

export function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <RSelect.Item
      value={value}
      className="relative flex cursor-pointer select-none items-center rounded-md py-sm pl-xl pr-md text-body text-fg-primary outline-none data-[highlighted]:bg-bg-secondary data-[state=checked]:font-medium"
    >
      <RSelect.ItemIndicator className="absolute left-sm">
        <Check className="h-4 w-4" />
      </RSelect.ItemIndicator>
      <RSelect.ItemText>{children}</RSelect.ItemText>
    </RSelect.Item>
  );
}
