import type { ComponentType } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { AlertCircle, AlertTriangle, CloudOff, Cpu, Inbox } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useTheme } from "@/lib/theme";
import { Button } from "./Button";

/**
 * Unified state-family primitive — Empty / Blocked / Offline / Missing share
 * one visual treatment so a future engineer doesn't reinvent each one.
 * Matches the Field Inspector prototype's `StateGalleryScreen`: 64x64
 * tinted rounded square + title + body + optional primary action.
 */
export type StateVariant = "empty" | "blocked" | "offline" | "missing" | "error";

const VARIANTS: Record<StateVariant, { icon: LucideIcon; iconBg: string; iconTint: string }> = {
  empty: { icon: Inbox, iconBg: "bg-card-gray", iconTint: "#8E8E85" },
  blocked: { icon: AlertTriangle, iconBg: "bg-card-peach", iconTint: "#B85518" },
  offline: { icon: CloudOff, iconBg: "bg-card-yellow", iconTint: "#7A5A12" },
  missing: { icon: Cpu, iconBg: "bg-card-lavender", iconTint: "#6E40E0" },
  error: { icon: AlertCircle, iconBg: "bg-grade-reject", iconTint: "#A02828" },
};

export function StateCard({
  variant = "empty",
  title,
  body,
  primaryLabel,
  onPrimary,
  /** Optional icon override; defaults to the variant's lucide icon. */
  icon: IconOverride,
}: {
  variant?: StateVariant;
  title: string;
  body?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  icon?: ComponentType<{ color?: string; size?: number }>;
}) {
  const v = VARIANTS[variant];
  const Icon = IconOverride ?? v.icon;
  return (
    <View className="items-center justify-center gap-md rounded-lg border border-line-tertiary bg-bg-primary py-3xl px-xl">
      <View className={`h-[64px] w-[64px] items-center justify-center rounded-[14px] ${v.iconBg}`}>
        <Icon color={v.iconTint} size={28} />
      </View>
      <View className="items-center gap-xs">
        <Text className="text-h4 font-semibold text-fg-primary text-center">{title}</Text>
        {body ? (
          <Text className="text-body text-fg-secondary text-center" style={{ maxWidth: 280 }}>
            {body}
          </Text>
        ) : null}
      </View>
      {primaryLabel && onPrimary ? (
        <Button size="sm" label={primaryLabel} onPress={onPrimary} />
      ) : null}
    </View>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center gap-md py-3xl">
      <ActivityIndicator />
      <Text className="text-body text-fg-secondary">{label ?? t("states.loading")}</Text>
    </View>
  );
}

/** Backwards-compatible wrapper. New code should use <StateCard variant="empty"> directly. */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title?: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { resolved } = useTheme();
  // If a custom action is passed we can't fold it into StateCard's
  // primaryLabel/onPrimary — fall back to the legacy layout so consumers
  // keep working without an API change.
  if (action) {
    const iconColor = resolved === "dark" ? "rgba(255,255,255,0.56)" : "rgba(13,16,40,0.62)";
    return (
      <View className="items-center justify-center gap-md rounded-lg border border-line-tertiary bg-card-cream py-3xl px-xl">
        <Inbox color={iconColor} size={32} />
        <View className="items-center gap-xs">
          <Text className="text-h2 font-medium text-fg-primary">{title ?? t("states.empty")}</Text>
          {hint ? <Text className="text-body text-fg-secondary text-center">{hint}</Text> : null}
        </View>
        {action}
      </View>
    );
  }
  return <StateCard variant="empty" title={title ?? t("states.empty")} body={hint} />;
}

/** Backwards-compatible wrapper. New code should use <StateCard variant="error"> directly. */
export function ErrorState({
  title,
  hint,
  onRetry,
}: {
  title?: string;
  hint?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <StateCard
      variant="error"
      title={title ?? t("states.error")}
      body={hint}
      primaryLabel={onRetry ? t("actions.retry") : undefined}
      onPrimary={onRetry}
    />
  );
}
