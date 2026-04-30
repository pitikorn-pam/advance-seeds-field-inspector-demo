import { useMemo, useState } from "react";
import { ScrollView, View, Text, Alert, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Calendar, ChevronLeft, Trash2, X } from "lucide-react-native";
import type { Batch } from "@advance-seeds/types";
import { DatePicker } from "@/components/ui/DatePicker";
import { formatDateLabel } from "@/components/ui/DateRangePicker";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { useBatches, useDeleteBatch, useUpsertBatch } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState, ErrorState } from "@/components/ui/States";

interface FormState {
  code: string;
  location: string;
  sownAt: string;
  notes: string;
}

const EMPTY_FORM: FormState = { code: "", location: "", sownAt: "", notes: "" };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Batch form — handles both create (id="new") and edit (id=uuid).
 *
 * Same journey as Capture classes: list page navigates here, top-left
 * back arrow returns; bottom row carries Delete (left, when editing) and
 * Save (right). No Cancel button — the back arrow is the single back path.
 */
export default function BatchEditor() {
  const { t, i18n } = useTranslation(["common", "batches"]);
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const isCreate = params.id === "new";
  const { profile } = useAuth();
  const policy = policyFor(profile);
  const batchesQuery = useBatches();
  const upsert = useUpsertBatch();
  const del = useDeleteBatch();

  const editing = useMemo<Batch | null>(() => {
    if (isCreate) return null;
    return batchesQuery.data?.find((b) => b.id === params.id) ?? null;
  }, [isCreate, params.id, batchesQuery.data]);

  const [form, setForm] = useState<FormState>(() => (editing ? hydrate(editing) : EMPTY_FORM));
  const [hydrated, setHydrated] = useState(isCreate);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  if (!hydrated && editing) {
    setForm(hydrate(editing));
    setHydrated(true);
  }

  const onSave = async () => {
    const code = form.code.trim();
    if (!code) {
      Alert.alert(t("batches:invalidCode"));
      return;
    }
    const sownAt = form.sownAt.trim();
    if (sownAt && !ISO_DATE_RE.test(sownAt)) {
      Alert.alert(t("batches:invalidDate"));
      return;
    }
    await upsert.mutateAsync({
      id: editing?.id,
      code,
      location: form.location.trim() || null,
      sown_at: sownAt || null,
      notes: form.notes.trim() || null,
    });
    router.back();
  };

  const onDelete = () => {
    if (!editing) return;
    const target = editing;
    Alert.alert(t("common:actions.delete"), t("batches:deleteConfirm"), [
      { text: t("common:actions.cancel"), style: "cancel" },
      {
        text: t("common:actions.delete"),
        style: "destructive",
        onPress: async () => {
          await del.mutateAsync(target.id);
          router.back();
        },
      },
    ]);
  };

  const title = isCreate ? t("batches:newBatch") : t("batches:editBatch");

  if (!isCreate && batchesQuery.isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
        <AppTopBar title={title} left={backAction(router, t)} />
        <LoadingState />
      </SafeAreaView>
    );
  }
  if (!isCreate && !editing) {
    return (
      <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
        <AppTopBar title={title} left={backAction(router, t)} />
        <ErrorState onRetry={() => void batchesQuery.refetch()} />
      </SafeAreaView>
    );
  }

  const canDelete = !isCreate && policy.canDeleteBatch();

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar title={title} left={backAction(router, t)} />
      <ScrollView contentContainerClassName="px-xl py-md gap-md">
        <Card>
          <View className="gap-md">
            <Field label={t("batches:fields.code")}>
              <Input
                placeholder={t("batches:codePlaceholder")}
                value={form.code}
                onChangeText={(code) => setForm((s) => ({ ...s, code }))}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </Field>
            <Field label={t("batches:fields.location")}>
              <Input
                placeholder={t("batches:locationPlaceholder")}
                value={form.location}
                onChangeText={(location) => setForm((s) => ({ ...s, location }))}
              />
            </Field>
            <Field label={t("batches:fields.sownAt")} hint={t("batches:sownHint")}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("batches:fields.sownAt")}
                onPress={() => setDatePickerOpen(true)}
                className="h-12 w-full flex-row items-center rounded-lg border border-line-secondary bg-bg-primary px-lg gap-sm"
              >
                <Calendar color="#0F6E56" size={16} />
                <Text
                  className={`flex-1 text-title ${
                    form.sownAt ? "text-fg-primary" : "text-fg-tertiary"
                  }`}
                >
                  {form.sownAt
                    ? formatDateLabel(form.sownAt, i18n.language)
                    : t("batches:sownDatePlaceholder")}
                </Text>
                {form.sownAt ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("common:actions.clear")}
                    hitSlop={8}
                    onPress={() => setForm((s) => ({ ...s, sownAt: "" }))}
                  >
                    <X color="#9D9D9A" size={16} />
                  </Pressable>
                ) : null}
              </Pressable>
            </Field>
            <Field label={t("batches:fields.notes")}>
              <Input
                placeholder={t("batches:notesPlaceholder")}
                value={form.notes}
                onChangeText={(notes) => setForm((s) => ({ ...s, notes }))}
                multiline
                textAlignVertical="top"
                style={{ height: 140, paddingTop: 12, paddingBottom: 12 }}
                className="!h-[140px]"
              />
            </Field>

            <View className="flex-row gap-sm mt-sm">
              {canDelete ? (
                <Button
                  className="flex-1"
                  variant="danger"
                  label={t("common:actions.delete")}
                  disabled={del.isPending}
                  renderLeadingIcon={() => <Trash2 color="#791F1F" size={14} />}
                  onPress={onDelete}
                />
              ) : null}
              <Button
                className="flex-1"
                label={t("common:actions.save")}
                disabled={upsert.isPending || !form.code.trim()}
                onPress={() => void onSave()}
              />
            </View>
          </View>
        </Card>
      </ScrollView>
      <DatePicker
        visible={datePickerOpen}
        value={form.sownAt || null}
        locale={i18n.language}
        title={t("batches:fields.sownAt")}
        onClose={() => setDatePickerOpen(false)}
        onClear={() => setForm((s) => ({ ...s, sownAt: "" }))}
        onChange={(key) => setForm((s) => ({ ...s, sownAt: key }))}
      />
    </SafeAreaView>
  );
}

function backAction(
  router: ReturnType<typeof useRouter>,
  t: ReturnType<typeof useTranslation>["t"],
) {
  return {
    accessibilityLabel: t("common:actions.back"),
    renderIcon: () => <ChevronLeft color="#1A1A1A" size={20} />,
    onPress: () => router.back(),
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-xs">
      <Text className="text-caption uppercase tracking-wide text-fg-secondary">{label}</Text>
      {children}
      {hint ? <Text className="text-caption text-fg-tertiary">{hint}</Text> : null}
    </View>
  );
}

function hydrate(b: Batch): FormState {
  return {
    code: b.code,
    location: b.location ?? "",
    sownAt: b.sown_at ?? "",
    notes: b.notes ?? "",
  };
}
