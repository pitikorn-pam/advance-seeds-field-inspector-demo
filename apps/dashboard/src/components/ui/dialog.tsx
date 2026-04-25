import * as RDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" }[size];
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <RDialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-bg-primary p-xl shadow-xl",
            sizeClass,
          )}
        >
          <div className="flex items-start justify-between gap-md">
            <div>
              <RDialog.Title className="text-h2 font-medium text-fg-primary">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-xs text-body text-fg-secondary">
                  {description}
                </RDialog.Description>
              ) : null}
            </div>
            <RDialog.Close
              className="rounded-md p-1 text-fg-secondary hover:bg-bg-secondary"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </RDialog.Close>
          </div>
          <div className="mt-lg">{children}</div>
          {footer ? <div className="mt-xl flex justify-end gap-md">{footer}</div> : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
