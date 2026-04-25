import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Variety } from "@advance-seeds/types";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { useVarieties, useUpsertVariety, useDeleteVariety } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";

const colorKeyTone = (key: string | null) => {
  if (!key) return "neutral" as const;
  if (key === "rice") return "success" as const;
  if (key === "corn") return "warning" as const;
  if (key === "legume") return "brand" as const;
  if (key === "mungbean") return "danger" as const;
  return "neutral" as const;
};

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
  const { data, isLoading, isError, refetch } = useVarieties();
  const upsert = useUpsertVariety();
  const del = useDeleteVariety();
  const [form, setForm] = useState<FormState | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

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
    <div className="flex flex-col gap-xl">
      <header className="flex items-center justify-between">
        <h1 className="text-h1 font-medium text-fg-primary">{t("varieties:title")}</h1>
        {policy.canCreateVariety() ? (
          <Button onClick={() => open()}>
            <Plus className="h-4 w-4" /> {t("varieties:newVariety")}
          </Button>
        ) : null}
      </header>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState hint={t("varieties:empty")} />
      ) : (
        <div className="grid grid-cols-1 gap-md md:grid-cols-2 lg:grid-cols-3">
          {data.map((v) => (
            <Card key={v.id} className="flex flex-col gap-sm">
              {v.image_url ? (
                <img
                  src={v.image_url}
                  alt={v.name}
                  className="h-32 w-full rounded-lg object-cover"
                />
              ) : null}
              <div className="flex items-center justify-between">
                <h2 className="text-title font-medium text-fg-primary">{v.name}</h2>
                <Pill tone={colorKeyTone(v.color_key)}>{v.color_key ?? "—"}</Pill>
              </div>
              {v.scientific_name ? (
                <div className="text-caption italic text-fg-secondary">{v.scientific_name}</div>
              ) : null}
              {v.description ? (
                <p className="text-body text-fg-secondary">{v.description}</p>
              ) : null}
              {policy.canEditVariety() ? (
                <div className="mt-sm flex gap-sm">
                  <Button variant="outline" size="sm" onClick={() => open(v)}>
                    <Pencil className="h-3 w-3" /> {t("common:actions.edit")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmId(v.id)}>
                    <Trash2 className="h-3 w-3 text-danger-text" /> {t("common:actions.delete")}
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {form !== null ? (
        <Dialog
          open
          onOpenChange={(o) => !o && setForm(null)}
          title={form.id ? t("varieties:editVariety") : t("varieties:newVariety")}
          footer={
            <>
              <Button variant="outline" onClick={() => setForm(null)}>
                {t("common:actions.cancel")}
              </Button>
              <Button
                onClick={async () => {
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
                disabled={!form.name || upsert.isPending}
              >
                {t("common:actions.save")}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-md">
            <Input
              placeholder={t("varieties:fields.name")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              placeholder={t("varieties:fields.scientificName")}
              value={form.scientific_name}
              onChange={(e) => setForm({ ...form, scientific_name: e.target.value })}
            />
            <Textarea
              placeholder={t("varieties:fields.description")}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <Input
              placeholder={t("varieties:fields.imageUrl")}
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            />
            <Input
              placeholder={t("varieties:fields.colorKey")}
              value={form.color_key}
              onChange={(e) => setForm({ ...form, color_key: e.target.value })}
            />
          </div>
        </Dialog>
      ) : null}

      <Dialog
        open={!!confirmId}
        onOpenChange={(o) => !o && setConfirmId(null)}
        title={t("common:actions.delete")}
        description={t("varieties:deleteConfirm")}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmId(null)}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={del.isPending}
              onClick={async () => {
                if (!confirmId) return;
                await del.mutateAsync(confirmId);
                setConfirmId(null);
              }}
            >
              {t("common:actions.delete")}
            </Button>
          </>
        }
      >
        <></>
      </Dialog>
    </div>
  );
}
