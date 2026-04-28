import { ScrollView, View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Stack } from "expo-router";
import { Check } from "lucide-react-native";
import type { Variety } from "@advance-seeds/types";
import { useVarieties } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { useCaptureSession } from "@/lib/capture/session";

const VARIETY_TINTS: Record<string, { bg: string; fg: string }> = {
  corn: { bg: "#FAEEDA", fg: "#854F0B" },
  rice: { bg: "#EAF3DE", fg: "#3B6D11" },
  legume: { bg: "#E1F5EE", fg: "#0F6E56" },
  mungbean: { bg: "#FAECE7", fg: "#993C1D" },
};

/**
 * Variety picker — selection-mode variant of the Library list, used by
 * the Setup screen's variety selector. Tapping a row commits the
 * selection to the capture session and dismisses back to setup.
 *
 * Why a dedicated route instead of reusing the Library tab? Tabs aren't
 * great for "select-and-return" flows: the tab bar stays visible, the
 * user can tap a different tab and accidentally abandon the selection,
 * and the dismiss target isn't obvious. A separate stack screen at
 * /capture/variety-picker keeps the selection scoped to the capture
 * journey and dismisses cleanly via router.back().
 */
export default function VarietyPicker() {
  const { t } = useTranslation(["common", "inspections", "varieties"]);
  const router = useRouter();
  const session = useCaptureSession();
  const { data, isLoading, isError, refetch } = useVarieties();

  const onSelect = (variety: Variety) => {
    session.set({ varietyId: variety.id });
    router.back();
  };

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["bottom"]}>
      <Stack.Screen options={{ title: t("inspections:capture.selectVariety") }} />
      <ScrollView contentContainerClassName="px-xl py-md gap-md">
        {!data || data.length === 0 ? (
          <EmptyState hint={t("varieties:empty")} />
        ) : (
          <Card className="p-0">
            {data.map((variety, idx) => {
              const tint = VARIETY_TINTS[variety.color_key ?? ""] ?? VARIETY_TINTS.rice;
              const selected = session.varietyId === variety.id;
              return (
                <Pressable
                  key={variety.id}
                  accessibilityRole="button"
                  onPress={() => onSelect(variety)}
                  className={`flex-row items-center gap-md px-lg py-md ${idx > 0 ? "border-t border-line-tertiary" : ""}`}
                >
                  <View
                    className="items-center justify-center"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: tint.bg,
                    }}
                  >
                    <Text className="font-medium" style={{ color: tint.fg, fontSize: 14 }}>
                      {variety.name.charAt(0)}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-title text-fg-primary font-medium">{variety.name}</Text>
                    {variety.scientific_name ? (
                      <Text className="text-caption text-fg-secondary italic">
                        {variety.scientific_name}
                      </Text>
                    ) : null}
                  </View>
                  {selected ? <Check color="#0F6E56" size={18} /> : null}
                </Pressable>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
