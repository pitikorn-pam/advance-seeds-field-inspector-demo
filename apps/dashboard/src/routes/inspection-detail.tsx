import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Save } from "lucide-react";
import type { Seed } from "@advance-seeds/types";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { useInspection, useUpdateInspectionNotes, useDeleteInspection } from "@/lib/queries";
import { Card, StatTile } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { LoadingState, ErrorState } from "@/components/ui/states";

const gradeToTone: Record<Seed["grade"], "success" | "warning" | "info" | "danger"> = {
  A: "success",
  B: "info",
  C: "warning",
  reject: "danger",
};

export default function InspectionDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation(["common", "inspections"]);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const policy = policyFor(profile);
  const { data, isLoading, isError, refetch } = useInspection(id);
  const updateNotes = useUpdateInspectionNotes();
  const del = useDeleteInspection();

  const [notes, setNotes] = useState("");
  const [seed, setSeed] = useState<Seed | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dateFmt = new Intl.DateTimeFormat(i18n.language === "th" ? "th-TH" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;
  const { inspection, seeds } = data;

  const canEdit = policy.canEditInspection(inspection);
  const canDelete = policy.canDeleteInspection(inspection);

  return (
    <div className="flex flex-col gap-xl">
      <Link
        to="/inspections"
        className="inline-flex items-center gap-xs text-body text-fg-secondary hover:text-fg-primary"
      >
        <ArrowLeft className="h-4 w-4" /> {t("common:actions.back")}
      </Link>

      <header className="flex flex-col gap-xs">
        <h1 className="text-h1 font-medium text-fg-primary">{inspection.variety?.name ?? "—"}</h1>
        <p className="text-body text-fg-secondary">
          {dateFmt.format(new Date(inspection.captured_at))} ·{" "}
          {inspection.inspector?.full_name ?? inspection.inspector?.email}
          {inspection.batch?.code ? ` · ${inspection.batch.code}` : ""}
        </p>
      </header>

      {inspection.image_url ? (
        <img
          src={inspection.image_url}
          alt={inspection.variety?.name ?? ""}
          className="aspect-[4/3] w-full max-w-2xl rounded-xl object-cover"
        />
      ) : null}

      <section className="grid grid-cols-2 gap-md md:grid-cols-4">
        <StatTile
          value={inspection.total_seeds}
          label={t("inspections:detail.summary.totalSeeds")}
        />
        <StatTile
          value={Number(inspection.mean_length_mm ?? 0).toFixed(2)}
          label={t("inspections:detail.summary.meanLength")}
        />
        <StatTile
          value={Number(inspection.mean_width_mm ?? 0).toFixed(2)}
          label={t("inspections:detail.summary.meanWidth")}
        />
        <StatTile
          value={Number(inspection.mean_area_mm2 ?? 0).toFixed(2)}
          label={t("inspections:detail.summary.meanArea")}
        />
      </section>

      <section>
        <h2 className="mb-md text-h2 font-medium text-fg-primary">
          {t("inspections:detail.perSeedTitle")}
        </h2>
        <Card className="p-md">
          <ul className="grid grid-cols-2 gap-sm sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {seeds.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSeed(s)}
                  className="flex w-full flex-col items-center gap-xs rounded-lg bg-bg-secondary px-md py-md text-center hover:bg-bg-tertiary"
                >
                  <div className="text-display font-medium text-fg-primary">{s.index}</div>
                  <Pill tone={gradeToTone[s.grade]}>{t(`inspections:seedGrade.${s.grade}`)}</Pill>
                  <div className="text-caption text-fg-secondary">
                    {Number(s.length_mm).toFixed(1)} × {Number(s.width_mm).toFixed(1)} mm
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {canEdit ? (
        <section>
          <h2 className="mb-md text-h2 font-medium text-fg-primary">{t("common:fields.notes")}</h2>
          <Card>
            <Textarea
              defaultValue={inspection.notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("common:fields.notes")}
            />
            <div className="mt-md flex justify-end gap-md">
              {canDelete ? (
                <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                  {t("common:actions.delete")}
                </Button>
              ) : null}
              <Button
                onClick={async () => {
                  await updateNotes.mutateAsync({ id: inspection.id, notes });
                }}
                disabled={updateNotes.isPending}
              >
                <Save className="h-4 w-4" />
                {t("common:actions.save")}
              </Button>
            </div>
          </Card>
        </section>
      ) : null}

      <Dialog
        open={!!seed}
        onOpenChange={(o) => !o && setSeed(null)}
        title={
          seed
            ? `${t("inspections:detail.perSeedTitle")} #${seed.index}`
            : t("inspections:detail.perSeedTitle")
        }
      >
        {seed ? (
          <dl className="grid grid-cols-2 gap-md">
            <div>
              <dt className="text-caption text-fg-secondary">
                {t("inspections:detail.summary.meanLength")}
              </dt>
              <dd className="text-title text-fg-primary">{Number(seed.length_mm).toFixed(2)} mm</dd>
            </div>
            <div>
              <dt className="text-caption text-fg-secondary">
                {t("inspections:detail.summary.meanWidth")}
              </dt>
              <dd className="text-title text-fg-primary">{Number(seed.width_mm).toFixed(2)} mm</dd>
            </div>
            <div>
              <dt className="text-caption text-fg-secondary">
                {t("inspections:detail.summary.meanArea")}
              </dt>
              <dd className="text-title text-fg-primary">{Number(seed.area_mm2).toFixed(2)} mm²</dd>
            </div>
            <div>
              <dt className="text-caption text-fg-secondary">{t("common:fields.role")}</dt>
              <dd>
                <Pill tone={gradeToTone[seed.grade]}>
                  {t(`inspections:seedGrade.${seed.grade}`)}
                </Pill>
              </dd>
            </div>
          </dl>
        ) : null}
      </Dialog>

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("common:actions.delete")}
        description={t("inspections:detail.deleteConfirm")}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={del.isPending}
              onClick={async () => {
                await del.mutateAsync(inspection.id);
                navigate("/inspections", { replace: true });
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
