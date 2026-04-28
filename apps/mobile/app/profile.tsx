import { ScrollView, View, Text, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Settings, RefreshCw, HelpCircle, ChevronRight, Video, Trash2 } from "lucide-react-native";
import type { Recording } from "@advance-seeds/types";
import { useAuth } from "@/lib/auth";
import { useRecordings, useDeleteRecording } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";

/**
 * Standalone read-only profile screen. Reachable from the settings tab via
 * the profile row; mirrors the prototype's profile layout — avatar with
 * initials, name, role, three stat tiles, and a menu group.
 *
 * The three stat tiles (This month / Day streak / Avg A) are aspirational
 * for v0.2.0 — the schema doesn't yet roll up per-user stats. We display
 * placeholder dashes until a `profile_stats` view is added.
 */
export default function ProfileScreen() {
  const { t } = useTranslation(["common", "profile"]);
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const recordings = useRecordings();
  const deleteRecording = useDeleteRecording();

  const initials =
    (profile?.full_name ?? profile?.email ?? "")
      .split(/\s+|@/)
      .map((part) => part.charAt(0).toUpperCase())
      .filter(Boolean)
      .slice(0, 2)
      .join("") || "—";

  const onSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-xl py-md gap-lg">
        <Text className="text-h1 font-medium text-fg-primary">{t("profile:title")}</Text>

        <Card>
          <View className="items-center">
            <View
              className="items-center justify-center mb-md"
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: "#E1F5EE",
              }}
            >
              <Text
                className="font-medium"
                style={{ fontSize: 24, color: "#04342C", letterSpacing: -0.5 }}
              >
                {initials}
              </Text>
            </View>
            <Text
              className="text-fg-primary font-medium"
              style={{ fontSize: 19, letterSpacing: -0.3 }}
            >
              {profile?.full_name ?? "—"}
            </Text>
            <View className="flex-row items-center gap-sm mt-xs">
              {profile?.role ? (
                <Pill
                  tone={profile.role === "admin" ? "brand" : "info"}
                  label={t(`common:roles.${profile.role}`)}
                />
              ) : null}
              <Text className="text-caption text-fg-secondary">{profile?.email}</Text>
            </View>
          </View>

          <View className="flex-row gap-sm mt-lg">
            <StatTile value="—" label={t("profile:stats.thisMonth")} />
            <StatTile value="—" label={t("profile:stats.dayStreak")} />
            <StatTile value="—" label={t("profile:stats.avgA")} />
          </View>
        </Card>

        <Card className="p-0">
          <MenuRow
            icon={<Settings color="#1A1A1A" size={16} />}
            label={t("profile:menu.settings")}
            onPress={() => router.push("/settings")}
          />
          <Divider />
          <MenuRow
            icon={<RefreshCw color="#1A1A1A" size={16} />}
            label={t("profile:menu.syncNow")}
            trailing={<Pill tone="success" dot label={t("profile:menu.syncStatusUpToDate")} />}
          />
          <Divider />
          <MenuRow icon={<HelpCircle color="#1A1A1A" size={16} />} label={t("profile:menu.help")} />
        </Card>

        <View>
          <Text className="text-h2 font-medium text-fg-primary mb-md">
            {t("profile:recordings.title")}
          </Text>
          {recordings.isLoading ? (
            <Card>
              <Text className="text-body text-fg-secondary">{t("common:states.loading")}</Text>
            </Card>
          ) : !recordings.data || recordings.data.length === 0 ? (
            <Card>
              <Text className="text-body text-fg-secondary">{t("profile:recordings.empty")}</Text>
            </Card>
          ) : (
            <Card className="p-0">
              {recordings.data.map((rec, i) => (
                <RecordingRow
                  key={rec.id}
                  recording={rec}
                  isLast={i === recordings.data.length - 1}
                  onDelete={() =>
                    Alert.alert(t("common:actions.delete"), t("profile:recordings.deleteConfirm"), [
                      { text: t("common:actions.cancel"), style: "cancel" },
                      {
                        text: t("common:actions.delete"),
                        style: "destructive",
                        onPress: () => {
                          deleteRecording.mutate(rec);
                        },
                      },
                    ])
                  }
                />
              ))}
            </Card>
          )}
        </View>

        <Card className="p-0">
          <Pressable onPress={onSignOut} className="px-lg py-md">
            <Text className="text-title font-medium" style={{ color: "#791F1F" }}>
              {t("profile:menu.signOut")}
            </Text>
          </Pressable>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function RecordingRow({
  recording,
  isLast,
  onDelete,
}: {
  recording: Recording;
  isLast: boolean;
  onDelete: () => void;
}) {
  const captured = new Date(recording.captured_at);
  const captionDate = captured.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <View
      className={`flex-row items-center gap-md px-lg py-md ${isLast ? "" : "border-b border-line-tertiary"}`}
    >
      <View
        className="items-center justify-center"
        style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "#1a1816" }}
      >
        <Video color="#5DCAA5" size={16} />
      </View>
      <View className="flex-1">
        <Text className="text-title text-fg-primary font-medium">
          {formatDuration(recording.duration_ms)}
        </Text>
        <Text className="text-caption text-fg-secondary">{captionDate}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete"
        onPress={onDelete}
        className="h-9 w-9 items-center justify-center rounded-full"
      >
        <Trash2 color="#791F1F" size={16} />
      </Pressable>
    </View>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 items-center bg-bg-secondary px-md py-md" style={{ borderRadius: 14 }}>
      <Text className="text-fg-primary font-medium" style={{ fontSize: 18, letterSpacing: -0.3 }}>
        {value}
      </Text>
      <Text
        className="text-fg-secondary uppercase mt-[2px]"
        style={{ fontSize: 10, letterSpacing: 0.3 }}
      >
        {label}
      </Text>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  trailing,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-md px-lg py-md"
      accessibilityRole="button"
    >
      <View
        className="items-center justify-center"
        style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "#F4F4F1" }}
      >
        {icon}
      </View>
      <Text className="flex-1 text-title text-fg-primary">{label}</Text>
      {trailing ?? <ChevronRight color="#9D9D9A" size={16} />}
    </Pressable>
  );
}

function Divider() {
  return <View className="h-[0.5px] bg-line-tertiary mx-lg" />;
}
