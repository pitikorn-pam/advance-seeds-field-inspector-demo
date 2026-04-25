import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Trash2, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import {
  useInspections,
  useDeleteInspection,
  useVarieties,
  useBatches,
  useInspectors,
} from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";

const ALL = "__all";

export default function InspectionsRoute() {
  const { t, i18n } = useTranslation(["common", "inspections"]);
  const { profile } = useAuth();
  const policy = policyFor(profile);
  const { data, isLoading, isError, refetch } = useInspections();
  const varieties = useVarieties();
  const batches = useBatches();
  const inspectors = useInspectors();
  const del = useDeleteInspection();

  const [q, setQ] = useState("");
  const [varietyId, setVarietyId] = useState<string>(ALL);
  const [batchId, setBatchId] = useState<string>(ALL);
  const [inspectorId, setInspectorId] = useState<string>(ALL);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.filter((row) => {
      if (varietyId !== ALL && row.variety_id !== varietyId) return false;
      if (batchId !== ALL && row.batch_id !== batchId) return false;
      if (inspectorId !== ALL && row.inspector_id !== inspectorId) return false;
      if (
        needle &&
        ![row.variety?.name, row.batch?.code, row.notes, row.inspector?.full_name]
          .filter(Boolean)
          .some((s) => s!.toLowerCase().includes(needle))
      )
        return false;
      return true;
    });
  }, [data, q, varietyId, batchId, inspectorId]);

  const dateFmt = new Intl.DateTimeFormat(i18n.language === "th" ? "th-TH" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-xl">
      <header className="flex items-center justify-between">
        <h1 className="text-h1 font-medium text-fg-primary">{t("inspections:title")}</h1>
      </header>

      <Card className="flex flex-col gap-md p-md md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-md top-1/2 h-4 w-4 -translate-y-1/2 text-fg-tertiary" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("inspections:list.searchPlaceholder")}
            className="pl-2xl"
          />
        </div>
        <Select value={varietyId} onValueChange={setVarietyId}>
          <SelectTrigger className="md:w-44">
            <SelectValue placeholder={t("inspections:list.filters.variety")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("inspections:list.filters.variety")}</SelectItem>
            {varieties.data?.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={batchId} onValueChange={setBatchId}>
          <SelectTrigger className="md:w-44">
            <SelectValue placeholder={t("inspections:list.filters.batch")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("inspections:list.filters.batch")}</SelectItem>
            {batches.data?.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {policy.canFilterByInspector() ? (
          <Select value={inspectorId} onValueChange={setInspectorId}>
            <SelectTrigger className="md:w-44">
              <SelectValue placeholder={t("inspections:list.filters.inspector")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("inspections:list.filters.inspector")}</SelectItem>
              {inspectors.data?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name ?? p.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState hint={t("inspections:list.empty")} />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line-tertiary">
            {filtered.map((row) => (
              <li key={row.id} className="flex items-center gap-lg px-xl py-md">
                <Link to={`/inspections/${row.id}`} className="flex-1">
                  <div className="text-title text-fg-primary">{row.variety?.name ?? "—"}</div>
                  <div className="text-caption text-fg-secondary">
                    {dateFmt.format(new Date(row.captured_at))}
                    {row.batch?.code ? ` · ${row.batch.code}` : ""} ·{" "}
                    {row.inspector?.full_name ?? row.inspector?.email}
                  </div>
                </Link>
                <Pill tone="brand">
                  {row.total_seeds} {t("inspections:detail.summary.totalSeeds")}
                </Pill>
                {policy.canDeleteInspection(row) ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("common:actions.delete")}
                    onClick={() => setConfirmId(row.id)}
                  >
                    <Trash2 className="h-4 w-4 text-danger-text" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog
        open={!!confirmId}
        onOpenChange={(o) => !o && setConfirmId(null)}
        title={t("common:actions.delete")}
        description={t("inspections:detail.deleteConfirm")}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmId(null)}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirmId) return;
                await del.mutateAsync(confirmId);
                setConfirmId(null);
              }}
              disabled={del.isPending}
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
