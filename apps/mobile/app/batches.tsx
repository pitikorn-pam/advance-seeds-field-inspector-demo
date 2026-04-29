import { useState } from "react";
import { ScrollView, View, Text, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronLeft, Plus, Pencil, Trash2 } from "lucide-react-native";
import type { Batch } from "@advance-seeds/types";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { useBatches, useUpsertBatch, useDeleteBatch } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";

interface FormState {
  id?: string;
  code: string;
  location: string;
  sown_at: string;
  notes: string;
}
const empty: FormState = { code: "", location: "", sown_at: "", notes: "" };

export default function BatchesRoute() {
  const { t } = useTranslation(["common", "batches"]);
  const router = useRouter();
  const { profile } = useAuth();
  const policy = policyFor(profile);
  const { data, isLoading, isError, refetch } = useBatches();
  const upsert = useUpsertBatch();
  const del = useDeleteBatch();
  const [form, setForm] = useState<FormState | null>(null);

  const open = (b?: Batch) =>
    setForm(
      b
        ? {
            id: b.id,
            code: b.code,
            location: b.location ?? "",
            sown_at: b.sown_at ?? "",
            notes: b.notes ?? "",
          }
        : empty,
    );

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("batches:title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          icon: <ChevronLeft color="#1A1A1A" size={20} />,
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-md">
        <View className="flex-row items-center justify-between">
          <Text className="text-h2 font-medium text-fg-primary">{t("batches:listTitle")}</Text>
          {policy.canCreateBatch() ? (
            <Button
              size="sm"
              label={t("batches:newBatch")}
              leadingIcon={<Plus color="#FFFFFF" size={14} />}
              onPress={() => open()}
            />
          ) : null}
        </View>

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState hint={t("batches:empty")} />
        ) : (
          data.map((b) => (
            <Card key={b.id}>
              <View className="flex-row items-center justify-between">
                <Text className="text-title font-medium text-fg-primary">{b.code}</Text>
              </View>
              {b.location ? (
                <Text className="text-body text-fg-secondary mt-xs">{b.location}</Text>
              ) : null}
              {b.sown_at ? (
                <Text className="text-caption text-fg-tertiary mt-xs">
                  {t("batches:fields.sownAt")}: {b.sown_at}
                </Text>
              ) : null}
              {b.notes ? (
                <Text className="text-body text-fg-secondary mt-sm">{b.notes}</Text>
              ) : null}
              {policy.canEditBatch() ? (
                <View className="flex-row gap-sm mt-md">
                  <Button
                    size="sm"
                    variant="outline"
                    label={t("common:actions.edit")}
                    leadingIcon={<Pencil color="#1A1A1A" size={12} />}
                    onPress={() => open(b)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    label={t("common:actions.delete")}
                    leadingIcon={<Trash2 color="#791F1F" size={12} />}
                    onPress={() =>
                      Alert.alert(t("common:actions.delete"), t("batches:deleteConfirm"), [
                        { text: t("common:actions.cancel"), style: "cancel" },
                        {
                          text: t("common:actions.delete"),
                          style: "destructive",
                          onPress: async () => {
                            await del.mutateAsync(b.id);
                          },
                        },
                      ])
                    }
                  />
                </View>
              ) : null}
            </Card>
          ))
        )}

        {form ? (
          <Card className="mt-lg">
            <Text className="text-h2 font-medium text-fg-primary mb-md">
              {form.id ? t("batches:editBatch") : t("batches:newBatch")}
            </Text>
            <View className="gap-md">
              <Input
                placeholder={t("batches:fields.code")}
                value={form.code}
                onChangeText={(code) => setForm({ ...form, code })}
              />
              <Input
                placeholder={t("batches:fields.location")}
                value={form.location}
                onChangeText={(location) => setForm({ ...form, location })}
              />
              <Input
                placeholder="YYYY-MM-DD"
                value={form.sown_at}
                onChangeText={(sown_at) => setForm({ ...form, sown_at })}
              />
              <Input
                placeholder={t("batches:fields.notes")}
                value={form.notes}
                onChangeText={(notes) => setForm({ ...form, notes })}
                multiline
              />
              <View className="flex-row gap-sm">
                <Button
                  className="flex-1"
                  variant="outline"
                  label={t("common:actions.cancel")}
                  onPress={() => setForm(null)}
                />
                <Button
                  className="flex-1"
                  label={t("common:actions.save")}
                  disabled={!form.code || upsert.isPending}
                  onPress={async () => {
                    await upsert.mutateAsync({
                      id: form.id,
                      code: form.code,
                      location: form.location || null,
                      sown_at: form.sown_at || null,
                      notes: form.notes || null,
                    });
                    setForm(null);
                  }}
                />
              </View>
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
