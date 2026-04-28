import { ScrollView, View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Stack } from "expo-router";
import { ChevronRight, Target } from "lucide-react-native";
import { Pill } from "@/components/ui/Pill";
import { useCaptureSession } from "@/lib/capture/session";

/**
 * Capture mode picker — second step of the Setup → Mode → Scan/Precise
 * flow that matches the prototype's three-screen capture journey
 * (prototype-fidelity-pass D2).
 *
 * Two cards: Live scan (red dot + Fast/No-calibration tags) and Precise
 * capture (brand-bordered, "Lab grade" badge, Accurate/Slower tags). Tap
 * either card to commit `mode` to the session and route to the chosen
 * camera screen. The camera screens themselves are unchanged from
 * mobile-real-usage; the split only affects the journey.
 */
export default function CaptureMode() {
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const session = useCaptureSession();

  const goLive = () => {
    session.set({ mode: "live" });
    router.push("/capture/scan");
  };
  const goPrecise = () => {
    session.set({ mode: "precise" });
    router.push("/capture/precise");
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["bottom"]}>
      <Stack.Screen options={{ title: t("inspections:capture.mode") }} />
      <ScrollView contentContainerClassName="px-xl py-md gap-md">
        <Text className="text-body text-fg-secondary px-xs">
          {t("inspections:capture.modePicker.subtitle")}
        </Text>

        <ModeCard
          accentBg="#FCEBEB"
          accentFg="#A32D2D"
          icon={
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "#A32D2D" }} />
          }
          title={t("inspections:capture.modeLive")}
          subtitle={t("inspections:capture.modePicker.liveSubtitle")}
          body={t("inspections:capture.modePicker.liveBody")}
          tags={[
            t("inspections:capture.modePicker.tagFast"),
            t("inspections:capture.modePicker.tagNoCalib"),
          ]}
          onPress={goLive}
        />

        <ModeCard
          accentBg="#E1F5EE"
          accentFg="#0F6E56"
          icon={<Target color="#0F6E56" size={20} />}
          title={t("inspections:capture.modePrecise")}
          subtitle={t("inspections:capture.modePicker.preciseSubtitle")}
          body={t("inspections:capture.modePicker.preciseBody")}
          highlightLabel={t("inspections:capture.modePicker.preciseLabGrade")}
          tags={[
            t("inspections:capture.modePicker.tagAccurate"),
            t("inspections:capture.modePicker.tagSlower"),
          ]}
          bordered
          onPress={goPrecise}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

interface ModeCardProps {
  accentBg: string;
  accentFg: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  body: string;
  tags: string[];
  highlightLabel?: string;
  bordered?: boolean;
  onPress: () => void;
}

function ModeCard({
  accentBg,
  accentFg,
  icon,
  title,
  subtitle,
  body,
  tags,
  highlightLabel,
  bordered = false,
  onPress,
}: ModeCardProps) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl bg-bg-primary p-lg gap-md"
      style={
        bordered
          ? { borderWidth: 2, borderColor: "#0F6E56" }
          : { borderWidth: 0.5, borderColor: "rgba(0,0,0,0.06)" }
      }
    >
      <View className="flex-row items-center gap-md">
        <View
          className="items-center justify-center"
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            backgroundColor: accentBg,
          }}
        >
          {icon}
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-sm">
            <Text className="text-title font-medium text-fg-primary">{title}</Text>
            {highlightLabel ? <Pill tone="brand" label={highlightLabel} /> : null}
          </View>
          <Text className="text-caption text-fg-secondary mt-xs">{subtitle}</Text>
        </View>
        <ChevronRight color={accentFg} size={18} />
      </View>
      <Text className="text-body text-fg-secondary">{body}</Text>
      <View className="flex-row gap-xs flex-wrap">
        {tags.map((tag) => (
          <Pill key={tag} tone="neutral" label={tag} />
        ))}
      </View>
    </Pressable>
  );
}
