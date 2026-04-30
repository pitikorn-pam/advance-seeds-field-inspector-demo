import { useMemo, useState } from "react";
import { ScrollView, View, Text, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, Layers, Plus, Search, X } from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { useBatches } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";

/**
 * Batches master-data list.
 *
 * Pattern matches the Capture classes screen: search input above, card list
 * with consistent row layout, top-right `+` for create, row tap for edit.
 * Form lives on `/batches/<id>` so the editor isn't crammed below a list
 * that grows as the season progresses.
 */
export default function BatchesRoute() {
  const { t } = useTranslation(["common", "batches"]);
  const router = useRouter();
  const { profile } = useAuth();
  const policy = policyFor(profile);
  const { data, isLoading, isError, refetch } = useBatches();
  const editable = policy.canEditBatch();
  const canCreate = policy.canCreateBatch();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((b) => {
      const hay = `${b.code} ${b.location ?? ""} ${b.notes ?? ""} ${b.sown_at ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, query]);

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("batches:title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#1A1A1A" size={20} />,
          onPress: () => router.back(),
        }}
        right={
          canCreate
            ? {
                accessibilityLabel: t("batches:newBatch"),
                renderIcon: () => <Plus color="#1A1A1A" size={20} />,
                onPress: () => router.push("/batches/new" as never),
              }
            : undefined
        }
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-md">
        <Text className="text-caption text-fg-secondary">{t("batches:intro")}</Text>

        <View className="flex-row items-center gap-sm rounded-xl bg-bg-primary border border-line-tertiary px-md py-sm">
          <Search color="#9D9D9A" size={16} />
          <TextInput
            placeholder={t("batches:searchPlaceholder")}
            placeholderTextColor="#9D9D9A"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 text-body text-fg-primary"
            returnKeyType="search"
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common:actions.cancel")}
              onPress={() => setQuery("")}
            >
              <X color="#9D9D9A" size={16} />
            </Pressable>
          ) : null}
        </View>

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState hint={query ? t("batches:emptyFiltered") : t("batches:empty")} />
        ) : (
          <Card className="p-0">
            {filtered.map((b, idx) => {
              const isLast = idx === filtered.length - 1;
              return (
                <Pressable
                  key={b.id}
                  accessibilityRole="button"
                  accessibilityLabel={b.code}
                  onPress={() => router.push(`/batches/${b.id}` as never)}
                  disabled={!editable}
                  className={`flex-row items-center gap-md px-lg py-md ${isLast ? "" : "border-b border-line-tertiary"}`}
                >
                  <View
                    className="items-center justify-center"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: "#FAEEDA",
                    }}
                  >
                    <Layers color="#854F0B" size={16} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-title text-fg-primary" numberOfLines={1}>
                      {b.code}
                    </Text>
                    <Text className="text-caption text-fg-secondary" numberOfLines={1}>
                      {b.location && b.location.trim() ? b.location : t("batches:noLocation")}
                    </Text>
                  </View>
                  <View className="items-end gap-[2px]">
                    {b.sown_at ? (
                      <Pill tone="neutral" label={t("batches:sownPill", { date: b.sown_at })} />
                    ) : (
                      <Text className="text-caption text-fg-tertiary">
                        {t("batches:sownPending")}
                      </Text>
                    )}
                  </View>
                  {editable ? <ChevronRight color="#9D9D9A" size={16} /> : null}
                </Pressable>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
