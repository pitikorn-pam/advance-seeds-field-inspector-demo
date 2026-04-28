import { ScrollView, View, Text, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Video, Trash2 } from "lucide-react-native";
import type { Recording } from "@advance-seeds/types";
import { useRecordings, useDeleteRecording } from "@/lib/queries";
import { Card } from "@/components/ui/Card";

/**
 * Recordings list — moved out of /profile in the prototype-fidelity-pass.
 * Reachable from /more → Recordings; the profile screen drops the
 * recordings list to stay a pure profile + sign-out surface.
 */
export default function RecordingsScreen() {
  const { t } = useTranslation(["common", "profile"]);
  const recordings = useRecordings();
  const deleteRecording = useDeleteRecording();

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-xl py-md gap-lg">
        <Text className="text-h1 font-medium text-fg-primary">{t("profile:recordings.title")}</Text>

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
