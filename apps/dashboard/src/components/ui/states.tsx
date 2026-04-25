import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, AlertCircle, Inbox } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/cn";

export function LoadingState({ label, className }: { label?: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex h-48 flex-col items-center justify-center gap-md text-fg-secondary",
        className,
      )}
    >
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      <span className="text-body">{label ?? t("states.loading")}</span>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-md rounded-xl border border-dashed border-line-tertiary bg-bg-primary py-3xl text-center",
        className,
      )}
    >
      <Inbox className="h-8 w-8 text-fg-tertiary" aria-hidden />
      <div>
        <div className="text-h2 font-medium text-fg-primary">{title ?? t("states.empty")}</div>
        {hint ? <div className="mt-xs text-body text-fg-secondary">{hint}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  hint,
  onRetry,
  className,
}: {
  title?: string;
  hint?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-md rounded-xl border border-dashed border-danger-text/30 bg-danger-bg/30 py-3xl text-center",
        className,
      )}
    >
      <AlertCircle className="h-8 w-8 text-danger-text" aria-hidden />
      <div>
        <div className="text-h2 font-medium text-fg-primary">{title ?? t("states.error")}</div>
        {hint ? <div className="mt-xs text-body text-fg-secondary">{hint}</div> : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("actions.retry")}
        </Button>
      ) : null}
    </div>
  );
}
