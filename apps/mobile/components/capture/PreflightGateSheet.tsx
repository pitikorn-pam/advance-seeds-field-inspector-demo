import { useState } from "react";
import { Modal, Pressable, View, Text, ScrollView } from "react-native";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Cpu, X } from "lucide-react-native";
import { Button } from "@/components/ui/Button";

/**
 * A single pre-flight blocker (failing/warning/installing). Passed checks
 * collapse into a quiet disclosure row underneath — they're listed by label
 * only, not as full rows.
 */
export type PreflightCheck = {
  /** Stable id for keying. Also used by the parent to drive the fix action. */
  id: string;
  /** `fail` = red; `warn` = yellow; `busy` = purple with optional progress bar. */
  state: "fail" | "warn" | "busy";
  label: string;
  /** Sub-line explaining why this check is blocking. */
  description: string;
  /** Inline action button (e.g. "Open variety editor"). Omit for busy states with progress. */
  fixLabel?: string;
  onFix?: () => void;
  /** 0–100, only for `busy` state. Renders a purple progress bar under the description. */
  progress?: number;
};

const STATE_STYLES = {
  fail: { dot: "bg-grade-reject-ink", chip: "bg-grade-reject", chipText: "text-grade-reject-ink" },
  warn: { dot: "bg-grade-b-ink", chip: "bg-grade-b", chipText: "text-grade-b-ink" },
  busy: { dot: "bg-primary", chip: "bg-card-lavender", chipText: "text-primary-deep" },
} as const;

/**
 * Bottom-sheet gate shown over the capture-setup screen when one or more
 * pre-flight checks fail. Only surfaces blockers prominently; passed checks
 * collapse into a "N other checks passed" disclosure (mint background).
 *
 * Driven entirely by props — the parent computes the actual checks from real
 * device state (model registry, calibration profile, camera permission,
 * variety class mapping) and passes them in.
 */
export function PreflightGateSheet({
  visible,
  title,
  description,
  checks,
  passedLabels,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  busy = false,
  onRequestClose,
}: {
  visible: boolean;
  title: string;
  description: string;
  /** Blocking / warning / busy checks. Empty array would imply nothing to gate on; callers should skip mounting the sheet in that case. */
  checks: PreflightCheck[];
  /** Labels of checks that passed. Shown collapsed under a mint disclosure. */
  passedLabels: string[];
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  /**
   * `true` switches the headline icon from a red alert triangle to a purple
   * CPU glyph (e.g. "Model is still installing"). Pure cosmetics — the gate
   * itself blocks in both cases.
   */
  busy?: boolean;
  /** Backdrop tap / hardware back press. Optional — sheet stays modal-ish if omitted. */
  onRequestClose?: () => void;
}) {
  const [passedOpen, setPassedOpen] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onRequestClose}>
      <Pressable className="flex-1 bg-black/45" onPress={onRequestClose}>
        {/* Inner Pressable swallows the tap so taps on the sheet don't close it. */}
        <Pressable onPress={() => {}} className="mt-auto">
          <View className="bg-bg-primary rounded-t-[20px] px-lg pb-xxl pt-sm">
            {/* drag handle */}
            <View className="mx-auto mb-md h-[4px] w-[40px] rounded-full bg-line-secondary" />

            {/* Headline */}
            <View className="flex-row items-start gap-md border-b border-line-tertiary pb-md">
              <View
                className={`h-[40px] w-[40px] items-center justify-center rounded-[10px] ${busy ? "bg-card-lavender" : "bg-grade-reject"}`}
              >
                {busy ? (
                  <Cpu size={20} color="#6E40E0" />
                ) : (
                  <AlertTriangle size={20} color="#A02828" />
                )}
              </View>
              <View className="flex-1 pt-[1px]">
                <Text className="text-h2 font-semibold text-fg-primary">{title}</Text>
                <Text className="text-caption text-fg-secondary mt-[4px]">{description}</Text>
              </View>
            </View>

            {/* Blocking checks */}
            <ScrollView className="mt-md max-h-[280px]" showsVerticalScrollIndicator={false}>
              <View className="gap-sm">
                {checks.map((c) => (
                  <PreflightCheckRow key={c.id} check={c} />
                ))}
              </View>

              {/* Passed disclosure */}
              {passedLabels.length > 0 ? (
                <Pressable
                  onPress={() => setPassedOpen((v) => !v)}
                  className="mt-md rounded-[10px] bg-grade-a px-md py-sm"
                >
                  <View className="flex-row items-center gap-sm">
                    <View className="h-[18px] w-[18px] items-center justify-center rounded-full bg-grade-a-ink">
                      <Check size={12} color="#FFFFFF" strokeWidth={3} />
                    </View>
                    <Text className="flex-1 text-caption font-medium text-grade-a-ink">
                      {passedLabels.length} other checks passed
                    </Text>
                    {passedOpen ? (
                      <ChevronUp size={14} color="#2D6E3F" />
                    ) : (
                      <ChevronDown size={14} color="#2D6E3F" />
                    )}
                  </View>
                  {passedOpen ? (
                    <View className="mt-sm gap-[4px] pl-[26px]">
                      {passedLabels.map((p) => (
                        <View key={p} className="flex-row items-center gap-[6px]">
                          <View className="h-[4px] w-[4px] rounded-full bg-grade-a-ink" />
                          <Text className="text-caption text-grade-a-ink">{p}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Pressable>
              ) : null}
            </ScrollView>

            {/* CTAs */}
            <View className="mt-lg gap-sm">
              <Button variant="primary" size="md" onPress={onPrimary}>
                {primaryLabel}
              </Button>
              <Button variant="ghost" size="md" onPress={onSecondary}>
                {secondaryLabel}
              </Button>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PreflightCheckRow({ check }: { check: PreflightCheck }) {
  const s = STATE_STYLES[check.state];
  return (
    <View className="rounded-[10px] border border-line-tertiary bg-bg-primary p-md">
      <View className="flex-row items-start gap-md">
        <View
          className={`mt-[1px] h-[26px] w-[26px] items-center justify-center rounded-full ${s.dot}`}
        >
          {check.state === "fail" ? (
            <X size={14} color="#FFFFFF" strokeWidth={3} />
          ) : check.state === "warn" ? (
            <AlertTriangle size={14} color="#FFFFFF" />
          ) : (
            <View className="h-[6px] w-[6px] rounded-full bg-fg-on-dark" />
          )}
        </View>
        <View className="flex-1">
          <Text className="text-body font-medium text-fg-primary">{check.label}</Text>
          <Text
            className={`mt-[2px] text-caption ${
              check.state === "fail"
                ? "text-grade-reject-ink"
                : check.state === "warn"
                  ? "text-grade-b-ink"
                  : "text-fg-secondary"
            }`}
          >
            {check.description}
          </Text>
          {typeof check.progress === "number" ? (
            <View className="mt-sm h-[4px] overflow-hidden rounded-full bg-line-tertiary">
              <View
                className="h-full bg-primary"
                style={{ width: `${Math.max(0, Math.min(100, check.progress))}%` }}
              />
            </View>
          ) : null}
        </View>
        {check.fixLabel && check.onFix ? (
          <Pressable
            onPress={check.onFix}
            className={`h-[30px] items-center justify-center rounded-md px-[10px] ${s.chip}`}
          >
            <Text className={`text-[12px] font-semibold ${s.chipText}`}>{check.fixLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
