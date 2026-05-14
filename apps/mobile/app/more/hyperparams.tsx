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
import { type InferenceStat, useInferenceStats } from "@/lib/analyzer/inferenceStats";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { Toggle } from "@/components/ui/Toggle";

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
  const stats = useInferenceStats();

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
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-md">
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

        <FeatureToggleCard
          label={t("more:hyperparams.morphFeature")}
          hint={t("more:hyperparams.morphFeatureHint")}
          enabled={hp.preprocessProfile === "morph_fused_v1"}
          onToggle={(enabled) =>
            void setHyperParams({
              preprocessProfile: enabled ? "morph_fused_v1" : "raw_rgb",
            })
          }
          accessibilityLabel={t("more:hyperparams.morphFeature")}
        />

        {stats.length > 0 ? (
          <Card>
            <Text className="text-caption uppercase tracking-wide text-fg-secondary mb-xs">
              {t("more:hyperparams.inferenceStats")}
            </Text>
            <Text className="text-caption text-fg-tertiary mb-md">
              {t("more:hyperparams.inferenceStatsHint")}
            </Text>
            <View className="gap-md">
              {stats.map((s) => (
                <InferenceStatRow key={s.source} stat={s} />
              ))}
            </View>
          </Card>
        ) : null}

        <Card>
          <Text className="text-caption uppercase tracking-wide text-fg-secondary mb-xs">
            {t("more:hyperparams.defaults")}
          </Text>
          <Text className="text-caption text-fg-tertiary">
            score {DEFAULT_HYPERPARAMS.scoreThreshold} · iou {DEFAULT_HYPERPARAMS.iouThreshold} ·{" "}
            {DEFAULT_HYPERPARAMS.targetFps} fps ·{" "}
            {t(`more:hyperparams.preprocessProfileValue.${DEFAULT_HYPERPARAMS.preprocessProfile}`)}
          </Text>
          <Button
            className="mt-md"
            variant="outline"
            label={t("more:hyperparams.reset")}
            renderLeadingIcon={() => <RotateCcw color="#171717" size={14} />}
            onPress={onReset}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureToggleCard({
  label,
  hint,
  enabled,
  onToggle,
  accessibilityLabel,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  accessibilityLabel: string;
}) {
  return (
    <Card>
      <View className="flex-row items-center justify-between gap-md">
        <View className="flex-1">
          <Text className="text-caption uppercase tracking-wide text-fg-secondary">{label}</Text>
          <Text className="text-caption text-fg-tertiary mt-xs">{hint}</Text>
        </View>
        <Toggle value={enabled} onValueChange={onToggle} accessibilityLabel={accessibilityLabel} />
      </View>
    </Card>
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

function InferenceStatRow({ stat }: { stat: InferenceStat }) {
  const maxBucket = Math.max(1, ...stat.buckets);
  return (
    <View>
      <View className="flex-row items-baseline justify-between">
        <Text className="text-body font-medium text-fg-primary">{stat.source}</Text>
        <Text className="text-caption text-fg-tertiary">
          n={stat.count} (total {stat.total})
        </Text>
      </View>
      <Text className="text-caption text-fg-secondary mt-[2px]">
        p50 {stat.p50}ms · p95 {stat.p95}ms · p99 {stat.p99}ms
      </Text>
      <View className="mt-sm flex-row items-end gap-[3px] h-[36px]">
        {stat.buckets.map((count, i) => {
          const heightPct = count === 0 ? 4 : 4 + (count / maxBucket) * 96;
          const edge = stat.bucketEdgesMs[i];
          const label = i === stat.buckets.length - 1 ? "≥" : `<${edge}`;
          return (
            <View key={i} className="flex-1 items-center">
              <View
                style={{
                  height: `${heightPct}%`,
                  width: "100%",
                  backgroundColor: count > 0 ? "#6E40E0" : "#E0E0DC",
                  borderRadius: 2,
                }}
              />
              <Text style={{ fontSize: 9, color: "#8C8C87", marginTop: 2 }}>{label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
