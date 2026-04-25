import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { useInspections, useVarieties } from "@/lib/queries";
import { Card, StatTile } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { downloadCsv, toCsv, type CsvColumn } from "@/lib/csv";

const ALL = "__all";
type Preset = "last7" | "last30" | "last90" | "custom";

function withinRange(date: Date, preset: Preset): boolean {
  if (preset === "custom") return true;
  const now = Date.now();
  const days = preset === "last7" ? 7 : preset === "last30" ? 30 : 90;
  return now - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

export default function ReportsRoute() {
  const { t } = useTranslation(["common", "reports"]);
  const { data, isLoading, isError, refetch } = useInspections();
  const varieties = useVarieties();

  const [preset, setPreset] = useState<Preset>("last30");
  const [varietyId, setVarietyId] = useState<string>(ALL);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((row) => {
      if (varietyId !== ALL && row.variety_id !== varietyId) return false;
      if (!withinRange(new Date(row.captured_at), preset)) return false;
      return true;
    });
  }, [data, preset, varietyId]);

  const totalSeeds = filtered.reduce((a, b) => a + (b.total_seeds ?? 0), 0);
  const meanLen =
    filtered.length === 0
      ? 0
      : filtered.reduce((a, b) => a + Number(b.mean_length_mm ?? 0), 0) / filtered.length;
  const meanArea =
    filtered.length === 0
      ? 0
      : filtered.reduce((a, b) => a + Number(b.mean_area_mm2 ?? 0), 0) / filtered.length;

  const headers = (key: string) => t(`reports:csvHeaders.${key}`);

  const exportCsv = () => {
    type Row = (typeof filtered)[number];
    const cols: CsvColumn<Row>[] = [
      { key: "id", header: headers("id"), value: (r) => r.id },
      { key: "captured_at", header: headers("captured_at"), value: (r) => r.captured_at },
      {
        key: "inspector_email",
        header: headers("inspector_email"),
        value: (r) => r.inspector?.email ?? "",
      },
      {
        key: "inspector_name",
        header: headers("inspector_name"),
        value: (r) => r.inspector?.full_name ?? "",
      },
      { key: "variety", header: headers("variety"), value: (r) => r.variety?.name ?? "" },
      { key: "batch_code", header: headers("batch_code"), value: (r) => r.batch?.code ?? "" },
      { key: "batch_location", header: headers("batch_location"), value: () => "" },
      { key: "calibration_source", header: headers("calibration_source"), value: () => "" },
      { key: "calibration_px_per_mm", header: headers("calibration_px_per_mm"), value: () => "" },
      { key: "total_seeds", header: headers("total_seeds"), value: (r) => r.total_seeds },
      {
        key: "mean_length_mm",
        header: headers("mean_length_mm"),
        value: (r) => r.mean_length_mm ?? "",
      },
      {
        key: "mean_width_mm",
        header: headers("mean_width_mm"),
        value: (r) => r.mean_width_mm ?? "",
      },
      {
        key: "mean_area_mm2",
        header: headers("mean_area_mm2"),
        value: (r) => r.mean_area_mm2 ?? "",
      },
      { key: "notes", header: headers("notes"), value: (r) => r.notes ?? "" },
      { key: "created_at", header: headers("created_at"), value: (r) => r.created_at },
    ];
    const csv = toCsv(filtered, cols);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadCsv(`inspections-${stamp}.csv`, csv);
  };

  return (
    <div className="flex flex-col gap-xl">
      <header className="flex items-center justify-between">
        <h1 className="text-h1 font-medium text-fg-primary">{t("reports:title")}</h1>
        <Button onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> {t("common:actions.exportCsv")}
        </Button>
      </header>

      <Card className="flex flex-col gap-md p-md md:flex-row md:items-center">
        <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
          <SelectTrigger className="md:w-44">
            <SelectValue placeholder={t("reports:filters.dateRange")} />
          </SelectTrigger>
          <SelectContent>
            {(["last7", "last30", "last90", "custom"] as const).map((p) => (
              <SelectItem key={p} value={p}>
                {t(`reports:filters.preset.${p}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={varietyId} onValueChange={setVarietyId}>
          <SelectTrigger className="md:w-44">
            <SelectValue placeholder={t("reports:filters.variety")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("reports:filters.variety")}</SelectItem>
            {varieties.data?.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="grid grid-cols-2 gap-md md:grid-cols-4">
          <StatTile value={filtered.length} label={t("reports:kpis.inspections")} />
          <StatTile value={totalSeeds} label={t("reports:kpis.totalSeeds")} />
          <StatTile value={meanLen.toFixed(2)} label={t("reports:kpis.meanLength")} />
          <StatTile value={meanArea.toFixed(2)} label={t("reports:kpis.meanArea")} />
        </section>
      )}
    </div>
  );
}
