import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useInspections } from "@/lib/queries";
import { Card, StatTile } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";

export default function HomeRoute() {
  const { t, i18n } = useTranslation(["common", "inspections"]);
  const { profile } = useAuth();
  const { data, isLoading, isError, refetch } = useInspections();

  const dateFmt = new Intl.DateTimeFormat(i18n.language === "th" ? "th-TH" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-2xl">
      <header>
        <h1 className="text-display font-medium tracking-[-0.02em] text-fg-primary">
          {t("common:appName")}
        </h1>
        <p className="mt-xs text-body text-fg-secondary">
          {profile?.full_name ?? profile?.email} ·{" "}
          {profile ? t(`common:roles.${profile.role}`) : ""}
        </p>
      </header>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data ? null : (
        <>
          <section className="grid grid-cols-2 gap-md md:grid-cols-4">
            <StatTile value={data.length} label={t("inspections:title")} />
            <StatTile
              value={data.reduce((a, b) => a + (b.total_seeds ?? 0), 0)}
              label={t("inspections:detail.summary.totalSeeds")}
            />
            <StatTile
              value={
                data.length === 0
                  ? "—"
                  : (
                      data.reduce((a, b) => a + Number(b.mean_length_mm ?? 0), 0) / data.length
                    ).toFixed(2)
              }
              label={t("inspections:detail.summary.meanLength")}
            />
            <StatTile
              value={
                data.length === 0
                  ? "—"
                  : (
                      data.reduce((a, b) => a + Number(b.mean_area_mm2 ?? 0), 0) / data.length
                    ).toFixed(2)
              }
              label={t("inspections:detail.summary.meanArea")}
            />
          </section>

          <section>
            <div className="mb-md flex items-center justify-between">
              <h2 className="text-h2 font-medium text-fg-primary">{t("inspections:title")}</h2>
              <Link to="/inspections" className="text-body text-brand hover:underline">
                {t("common:actions.search")} →
              </Link>
            </div>
            {data.length === 0 ? (
              <EmptyState hint={t("inspections:list.empty")} />
            ) : (
              <Card className="p-0">
                <ul className="divide-y divide-line-tertiary">
                  {data.slice(0, 6).map((row) => (
                    <li key={row.id}>
                      <Link
                        to={`/inspections/${row.id}`}
                        className="flex items-center gap-lg px-xl py-md hover:bg-bg-secondary"
                      >
                        <div className="flex-1">
                          <div className="text-title text-fg-primary">
                            {row.variety?.name ?? "—"}
                          </div>
                          <div className="text-caption text-fg-secondary">
                            {dateFmt.format(new Date(row.captured_at))} ·{" "}
                            {row.inspector?.full_name ?? row.inspector?.email}
                          </div>
                        </div>
                        <Pill tone="brand">
                          {row.total_seeds} {t("inspections:detail.summary.totalSeeds")}
                        </Pill>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
