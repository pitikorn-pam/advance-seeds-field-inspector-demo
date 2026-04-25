import { ScrollView, View, Text, RefreshControl, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter, Link } from "expo-router";
import { Camera } from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { useInspections } from "@/lib/queries";
import { Card, StatTile } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";

export default function HomeScreen() {
  const { t, i18n } = useTranslation(["common", "inspections"]);
  const { profile } = useAuth();
  const router = useRouter();
  const { data, isLoading, isError, refetch, isRefetching } = useInspections();

  const dateFmt = new Intl.DateTimeFormat(i18n.language === "th" ? "th-TH" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top"]}>
      <ScrollView
        contentContainerClassName="px-xl py-xl gap-xl"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
      >
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-display font-medium text-fg-primary tracking-tight">
              {t("common:appName")}
            </Text>
            <Text className="text-body text-fg-secondary mt-xs">
              {profile?.full_name ?? profile?.email}
              {profile ? ` · ${t(`common:roles.${profile.role}`)}` : ""}
            </Text>
          </View>
          <Pill tone="success" dot label={t("common:sync.allSynced")} />
        </View>

        <Button
          label={t("common:actions.newInspection")}
          leadingIcon={<Camera color="#FFFFFF" size={18} />}
          onPress={() => router.push("/capture")}
        />

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : !data ? null : (
          <>
            <View className="flex-row gap-sm">
              <StatTile value={data.length} label={t("inspections:title")} />
              <StatTile
                value={data.reduce((a, b) => a + (b.total_seeds ?? 0), 0)}
                label={t("inspections:detail.summary.totalSeeds")}
              />
            </View>

            <View>
              <Text className="text-h2 font-medium text-fg-primary mb-sm">
                {t("inspections:title")}
              </Text>
              {data.length === 0 ? (
                <EmptyState hint={t("inspections:list.empty")} />
              ) : (
                <Card className="p-0">
                  {data.slice(0, 5).map((row, idx) => (
                    <Link key={row.id} href={`/inspections/${row.id}`} asChild>
                      <Pressable
                        className={`flex-row items-center gap-md px-xl py-md ${
                          idx > 0 ? "border-t border-line-tertiary" : ""
                        }`}
                      >
                        <View className="flex-1">
                          <Text className="text-title text-fg-primary">
                            {row.variety?.name ?? "—"}
                          </Text>
                          <Text className="text-caption text-fg-secondary mt-xs">
                            {dateFmt.format(new Date(row.captured_at))}
                            {row.batch?.code ? ` · ${row.batch.code}` : ""}
                          </Text>
                        </View>
                        <Pill tone="brand" label={`${row.total_seeds}`} />
                      </Pressable>
                    </Link>
                  ))}
                </Card>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
