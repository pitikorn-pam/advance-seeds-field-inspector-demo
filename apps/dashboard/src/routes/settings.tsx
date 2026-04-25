import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useCalibrations } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { LoadingState, ErrorState } from "@/components/ui/states";
import type { Theme } from "@advance-seeds/types";

export default function SettingsRoute() {
  const { t, i18n } = useTranslation(["common", "settings", "calibration"]);
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const cal = useCalibrations();

  return (
    <div className="flex flex-col gap-xl">
      <h1 className="text-h1 font-medium text-fg-primary">{t("settings:title")}</h1>

      <section className="flex flex-col gap-md">
        <h2 className="text-h2 font-medium text-fg-primary">{t("settings:sections.profile")}</h2>
        <Card>
          {profile ? (
            <dl className="grid grid-cols-2 gap-md">
              <div>
                <dt className="text-caption text-fg-secondary">{t("common:fields.name")}</dt>
                <dd className="text-title text-fg-primary">{profile.full_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-caption text-fg-secondary">{t("common:fields.email")}</dt>
                <dd className="text-title text-fg-primary">{profile.email}</dd>
              </div>
              <div>
                <dt className="text-caption text-fg-secondary">{t("common:fields.role")}</dt>
                <dd>
                  <Pill tone={profile.role === "admin" ? "brand" : "info"}>
                    {t(`common:roles.${profile.role}`)}
                  </Pill>
                </dd>
              </div>
              <div>
                <dt className="text-caption text-fg-secondary">{t("common:fields.language")}</dt>
                <dd className="text-title text-fg-primary">
                  {t(`common:languages.${profile.locale}`)}
                </dd>
              </div>
            </dl>
          ) : null}
          <Button variant="outline" className="mt-lg" onClick={signOut}>
            {t("common:actions.signOut")}
          </Button>
        </Card>
      </section>

      <section className="flex flex-col gap-md">
        <h2 className="text-h2 font-medium text-fg-primary">{t("settings:sections.appearance")}</h2>
        <Card>
          <p className="mb-md text-body text-fg-secondary">{t("settings:appearanceHint")}</p>
          <div className="flex gap-md">
            <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder={t("common:fields.theme")} />
              </SelectTrigger>
              <SelectContent>
                {(["light", "dark", "system"] as const).map((t2) => (
                  <SelectItem key={t2} value={t2}>
                    {t(`common:themes.${t2}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={i18n.language.startsWith("th") ? "th" : "en"}
              onValueChange={(v) => void i18n.changeLanguage(v)}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder={t("common:fields.language")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t("common:languages.en")}</SelectItem>
                <SelectItem value="th">{t("common:languages.th")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-md">
        <h2 className="text-h2 font-medium text-fg-primary">
          {t("settings:sections.calibration")}
        </h2>
        {cal.isLoading ? (
          <LoadingState />
        ) : cal.isError ? (
          <ErrorState onRetry={() => void cal.refetch()} />
        ) : (
          <div className="grid grid-cols-1 gap-md md:grid-cols-2">
            {cal.data?.map((c) => (
              <Card key={c.id}>
                <div className="flex items-center justify-between">
                  <h3 className="text-title font-medium text-fg-primary">{c.name}</h3>
                  <Pill tone="brand">{t(`calibration:sources.${c.source}`)}</Pill>
                </div>
                <dl className="mt-md grid grid-cols-2 gap-md">
                  <div>
                    <dt className="text-caption text-fg-secondary">
                      {t("calibration:fields.pxPerMm")}
                    </dt>
                    <dd className="font-mono text-title text-fg-primary">
                      {Number(c.px_per_mm).toFixed(2)} px/mm
                    </dd>
                  </div>
                </dl>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
