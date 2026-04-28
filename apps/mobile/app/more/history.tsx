import { ScrollView, View, Text, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Link } from "expo-router";
import { useInspections } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";

/**
 * History — flat reverse-chron list of inspections, reachable from /more.
 * Renamed from the old (tabs)/inspections.tsx in the prototype-fidelity
 * pass; segmented filter and date grouping land in phase 6.
 */
export default function HistoryScreen() {
  const { t, i18n } = useTranslation(["common", "inspections"]);
  const { data, isLoading, isError, refetch, isRefetching } = useInspections();
  const dateFmt = new Intl.DateTimeFormat(i18n.language === "th" ? "th-TH" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["bottom"]}>
      <View className="px-xl py-md">
        <Text className="text-h1 font-medium text-fg-primary">{t("inspections:title")}</Text>
      </View>
      <ScrollView
        contentContainerClassName="px-xl pb-xl gap-md"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
      >
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState hint={t("inspections:list.empty")} />
        ) : (
          <Card className="p-0">
            {data.map((row, idx) => (
              <Link key={row.id} href={`/inspections/${row.id}`} asChild>
                <Pressable
                  className={`flex-row items-center gap-md px-xl py-md ${
                    idx > 0 ? "border-t border-line-tertiary" : ""
                  }`}
                >
                  <View className="flex-1">
                    <Text className="text-title text-fg-primary">{row.variety?.name ?? "—"}</Text>
                    <Text className="text-caption text-fg-secondary mt-xs">
                      {dateFmt.format(new Date(row.captured_at))}
                      {row.batch?.code ? ` · ${row.batch.code}` : ""} ·{" "}
                      {row.inspector?.full_name ?? row.inspector?.email}
                    </Text>
                  </View>
                  <Pill tone="brand" label={`${row.total_seeds}`} />
                </Pressable>
              </Link>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
