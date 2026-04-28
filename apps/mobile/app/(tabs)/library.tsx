import { useState } from "react";
import { ScrollView, View, Text, Alert, Image, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Plus, Pencil, Trash2, ChevronRight } from "lucide-react-native";
import type { Variety } from "@advance-seeds/types";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { useVarieties, useUpsertVariety, useDeleteVariety } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";

interface FormState {
  id?: string;
  name: string;
  scientific_name: string;
  description: string;
  image_url: string;
  color_key: string;
}
const empty: FormState = {
  name: "",
  scientific_name: "",
  description: "",
  image_url: "",
  color_key: "rice",
};

export default function VarietiesRoute() {
  const { t } = useTranslation(["common", "varieties"]);
  const { profile } = useAuth();
  const policy = policyFor(profile);
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useVarieties();
  const upsert = useUpsertVariety();
  const del = useDeleteVariety();
  const [form, setForm] = useState<FormState | null>(null);

  const open = (v?: Variety) =>
    setForm(
      v
        ? {
            id: v.id,
            name: v.name,
            scientific_name: v.scientific_name ?? "",
            description: v.description ?? "",
            image_url: v.image_url ?? "",
            color_key: v.color_key ?? "rice",
          }
        : empty,
    );

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-xl py-xl gap-md">
        <View className="flex-row items-center justify-between">
          <Text className="text-h1 font-medium text-fg-primary">{t("varieties:title")}</Text>
          {policy.canCreateVariety() ? (
            <Button
              size="sm"
              label={t("varieties:newVariety")}
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
          <EmptyState hint={t("varieties:empty")} />
        ) : (
          data.map((v) => (
            <Card key={v.id}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={v.name}
                onPress={() => router.push(`/varieties/${v.id}`)}
              >
                {v.image_url ? (
                  <Image
                    source={{ uri: v.image_url }}
                    className="h-32 w-full rounded-lg mb-md"
                    resizeMode="cover"
                  />
                ) : null}
                <View className="flex-row items-center justify-between">
                  <Text className="text-title font-medium text-fg-primary">{v.name}</Text>
                  <View className="flex-row items-center gap-sm">
                    <Pill tone="brand" label={v.color_key ?? "—"} />
                    <ChevronRight color="#9D9D9A" size={16} />
                  </View>
                </View>
                {v.scientific_name ? (
                  <Text className="text-caption italic text-fg-secondary mt-xs">
                    {v.scientific_name}
                  </Text>
                ) : null}
                {v.description ? (
                  <Text className="text-body text-fg-secondary mt-sm" numberOfLines={2}>
                    {v.description}
                  </Text>
                ) : null}
              </Pressable>
              {policy.canEditVariety() ? (
                <View className="flex-row gap-sm mt-md">
                  <Button
                    size="sm"
                    variant="outline"
                    label={t("common:actions.edit")}
                    leadingIcon={<Pencil color="#1A1A1A" size={12} />}
                    onPress={() => open(v)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    label={t("common:actions.delete")}
                    leadingIcon={<Trash2 color="#791F1F" size={12} />}
                    onPress={() =>
                      Alert.alert(t("common:actions.delete"), t("varieties:deleteConfirm"), [
                        { text: t("common:actions.cancel"), style: "cancel" },
                        {
                          text: t("common:actions.delete"),
                          style: "destructive",
                          onPress: async () => {
                            await del.mutateAsync(v.id);
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
              {form.id ? t("varieties:editVariety") : t("varieties:newVariety")}
            </Text>
            <View className="gap-md">
              <Input
                placeholder={t("varieties:fields.name")}
                value={form.name}
                onChangeText={(name) => setForm({ ...form, name })}
              />
              <Input
                placeholder={t("varieties:fields.scientificName")}
                value={form.scientific_name}
                onChangeText={(scientific_name) => setForm({ ...form, scientific_name })}
              />
              <Input
                placeholder={t("varieties:fields.description")}
                value={form.description}
                onChangeText={(description) => setForm({ ...form, description })}
                multiline
              />
              <Input
                placeholder={t("varieties:fields.imageUrl")}
                value={form.image_url}
                onChangeText={(image_url) => setForm({ ...form, image_url })}
              />
              <Input
                placeholder={t("varieties:fields.colorKey")}
                value={form.color_key}
                onChangeText={(color_key) => setForm({ ...form, color_key })}
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
                  disabled={!form.name || upsert.isPending}
                  onPress={async () => {
                    await upsert.mutateAsync({
                      id: form.id,
                      name: form.name,
                      scientific_name: form.scientific_name || null,
                      description: form.description || null,
                      image_url: form.image_url || null,
                      color_key: form.color_key || null,
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
