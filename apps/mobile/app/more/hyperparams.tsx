import { ScrollView, View, Text, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronLeft, RotateCcw } from "lucide-react-native";
import {
  DEFAULT_HYPERPARAMS,
  resetHyperParams,
  setHyperParams,
  useHyperParams,
} from "@/lib/analyzer/hyperparams";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/ui/AppTopBar";

const SCORE_PRESETS = [0.25, 0.4, 0.5, 0.6, 0.75];
const IOU_PRESETS = [0.45, 0.55, 0.65, 0.75, 0.85];
const FPS_PRESETS = [5, 10, 15, 30, 60];

/**
 * Hyperparameters playground for QA. Persisted to AsyncStorage so a
 * reload keeps the user's tuning, and subscribed to live by both the
 * single-shot analyzer (`analyze()` reads `getHyperParamsSync()` per
 * call) and the live worklet (deps array on the inferOnJS memo + the
 * frameProcessor itself, so changing values rebuilds the worklet
 * with the new throttle).
 */
export default function HyperParamsScreen() {
  const { t } = useTranslation(["common", "more"]);
  const router = useRouter();
  const hp = useHyperParams();

  const onReset = () => {
    Alert.alert(t("more:hyperparams.resetTitle"), t("more:hyperparams.resetBody"), [
      { text: t("common:actions.cancel"), style: "cancel" },
      {
        text: t("more:hyperparams.reset"),
        style: "destructive",
        onPress: () => void resetHyperParams(),
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("more:hyperparams.title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#1A1A1A" size={20} />,
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-md">
        <Text className="text-caption text-fg-secondary">{t("more:hyperparams.intro")}</Text>

        <ParamCard
          label={t("more:hyperparams.scoreThreshold")}
          hint={t("more:hyperparams.scoreThresholdHint")}
          value={hp.scoreThreshold}
          presets={SCORE_PRESETS}
          format={(v) => v.toFixed(2)}
          onPick={(v) => void setHyperParams({ scoreThreshold: v })}
        />

        <ParamCard
          label={t("more:hyperparams.iouThreshold")}
          hint={t("more:hyperparams.iouThresholdHint")}
          value={hp.iouThreshold}
          presets={IOU_PRESETS}
          format={(v) => v.toFixed(2)}
          onPick={(v) => void setHyperParams({ iouThreshold: v })}
        />

        <ParamCard
          label={t("more:hyperparams.targetFps")}
          hint={t("more:hyperparams.targetFpsHint")}
          value={hp.targetFps}
          presets={FPS_PRESETS}
          format={(v) => `${v} fps`}
          onPick={(v) => void setHyperParams({ targetFps: v })}
        />

        <Card>
          <Text className="text-caption uppercase tracking-wide text-fg-secondary mb-xs">
            {t("more:hyperparams.defaults")}
          </Text>
          <Text className="text-caption text-fg-tertiary">
            score {DEFAULT_HYPERPARAMS.scoreThreshold} · iou {DEFAULT_HYPERPARAMS.iouThreshold} ·{" "}
            {DEFAULT_HYPERPARAMS.targetFps} fps
          </Text>
          <Button
            className="mt-md"
            variant="outline"
            label={t("more:hyperparams.reset")}
            renderLeadingIcon={() => <RotateCcw color="#1A1A1A" size={14} />}
            onPress={onReset}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function ParamCard({
  label,
  hint,
  value,
  presets,
  format,
  onPick,
}: {
  label: string;
  hint: string;
  value: number;
  presets: number[];
  format: (v: number) => string;
  onPick: (v: number) => void;
}) {
  return (
    <Card>
      <View className="flex-row items-baseline justify-between">
        <Text className="text-caption uppercase tracking-wide text-fg-secondary">{label}</Text>
        <Text className="text-title font-medium text-fg-primary">{format(value)}</Text>
      </View>
      <Text className="text-caption text-fg-tertiary mt-xs mb-md">{hint}</Text>
      <View className="flex-row flex-wrap gap-sm">
        {presets.map((p) => (
          <Chip
            key={p}
            label={format(p)}
            active={Math.abs(value - p) < 1e-6}
            onPress={() => onPick(p)}
          />
        ))}
      </View>
    </Card>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={`rounded-full px-md py-sm ${active ? "bg-brand active:opacity-90" : "bg-bg-primary border border-line-tertiary"}`}
    >
      <Text className={`text-caption font-medium ${active ? "text-brand-on" : "text-fg-primary"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
