import { View, Text, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { AlertCircle, Inbox } from "lucide-react-native";
import { useTheme } from "@/lib/theme";
import { Button } from "./Button";

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center gap-md py-3xl">
      <ActivityIndicator />
      <Text className="text-body text-fg-secondary">{label ?? t("states.loading")}</Text>
    </View>
  );
}

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
  const { resolved } = useTheme();
  const iconColor = resolved === "dark" ? "#F7C1C1" : "#8A1F1B";
  return (
    <View className="items-center justify-center gap-md rounded-lg border border-danger-text/30 bg-danger-bg/30 py-3xl px-xl">
      <AlertCircle color={iconColor} size={32} />
      <View className="items-center gap-xs">
        <Text className="text-h2 font-medium text-fg-primary">{title ?? t("states.error")}</Text>
        {hint ? <Text className="text-body text-fg-secondary text-center">{hint}</Text> : null}
      </View>
      {onRetry ? (
        <Button variant="outline" size="sm" label={t("actions.retry")} onPress={onRetry} />
      ) : null}
    </View>
  );
}
