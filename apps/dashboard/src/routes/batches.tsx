import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Batch } from "@advance-seeds/types";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { useBatches, useUpsertBatch, useDeleteBatch } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";

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
  const { profile } = useAuth();
  const policy = policyFor(profile);
  const { data, isLoading, isError, refetch } = useBatches();
  const upsert = useUpsertBatch();
  const del = useDeleteBatch();
  const [form, setForm] = useState<FormState | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

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
    <div className="flex flex-col gap-xl">
      <header className="flex items-center justify-between">
        <h1 className="text-h1 font-medium text-fg-primary">{t("batches:title")}</h1>
        {policy.canCreateBatch() ? (
          <Button onClick={() => open()}>
            <Plus className="h-4 w-4" /> {t("batches:newBatch")}
          </Button>
        ) : null}
      </header>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState hint={t("batches:empty")} />
      ) : (
        <Card className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line-tertiary text-left text-caption text-fg-secondary">
                <th className="px-xl py-md">{t("batches:fields.code")}</th>
                <th className="px-xl py-md">{t("batches:fields.location")}</th>
                <th className="px-xl py-md">{t("batches:fields.sownAt")}</th>
                <th className="px-xl py-md">{t("batches:fields.notes")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.id} className="border-b border-line-tertiary last:border-0">
                  <td className="px-xl py-md text-title text-fg-primary">{b.code}</td>
                  <td className="px-xl py-md text-body text-fg-secondary">{b.location}</td>
                  <td className="px-xl py-md text-body text-fg-secondary">{b.sown_at ?? "—"}</td>
                  <td className="px-xl py-md text-body text-fg-secondary">{b.notes}</td>
                  <td className="px-xl py-md text-right">
                    {policy.canEditBatch() ? (
                      <div className="inline-flex gap-sm">
                        <Button variant="ghost" size="icon" onClick={() => open(b)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setConfirmId(b.id)}>
                          <Trash2 className="h-4 w-4 text-danger-text" />
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {form !== null ? (
        <Dialog
          open
          onOpenChange={(o) => !o && setForm(null)}
          title={form.id ? t("batches:editBatch") : t("batches:newBatch")}
          footer={
            <>
              <Button variant="outline" onClick={() => setForm(null)}>
                {t("common:actions.cancel")}
              </Button>
              <Button
                disabled={!form.code || upsert.isPending}
                onClick={async () => {
                  await upsert.mutateAsync({
                    id: form.id,
                    code: form.code,
                    location: form.location || null,
                    sown_at: form.sown_at || null,
                    notes: form.notes || null,
                  });
                  setForm(null);
                }}
              >
                {t("common:actions.save")}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-md">
            <Input
              placeholder={t("batches:fields.code")}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Input
              placeholder={t("batches:fields.location")}
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
            <Input
              type="date"
              placeholder={t("batches:fields.sownAt")}
              value={form.sown_at}
              onChange={(e) => setForm({ ...form, sown_at: e.target.value })}
            />
            <Textarea
              placeholder={t("batches:fields.notes")}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </Dialog>
      ) : null}

      <Dialog
        open={!!confirmId}
        onOpenChange={(o) => !o && setConfirmId(null)}
        title={t("common:actions.delete")}
        description={t("batches:deleteConfirm")}
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
