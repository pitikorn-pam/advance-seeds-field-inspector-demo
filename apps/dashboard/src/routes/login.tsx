import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Sprout } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { LocaleSwitcher } from "@/components/shell/LocaleSwitcher";
import { ThemeSwitcher } from "@/components/shell/ThemeSwitcher";

export default function LoginRoute() {
  const { t } = useTranslation(["auth", "common"]);
  const navigate = useNavigate();
  const { session } = useAuth();
  const [email, setEmail] = useState("jane@advanceseeds.com");
  const [password, setPassword] = useState("DemoSeeds2026!");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) {
    navigate("/", { replace: true });
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (err) {
      setError(t("auth:login.errorInvalid"));
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-bg-secondary px-xl">
      <div className="absolute right-xl top-xl flex items-center gap-sm">
        <LocaleSwitcher />
        <ThemeSwitcher />
      </div>
      <Card className="w-full max-w-md">
        <div className="flex items-center gap-sm text-fg-primary">
          <Sprout className="h-6 w-6 text-brand" />
          <span className="text-h2 font-medium">{t("common:appName")}</span>
        </div>
        <h1 className="mt-2xl text-display font-medium tracking-[-0.02em] text-fg-primary">
          {t("auth:login.title")}
        </h1>
        <p className="mt-xs text-body text-fg-secondary">{t("auth:login.subtitle")}</p>
        <form className="mt-2xl flex flex-col gap-md" onSubmit={onSubmit}>
          <Input
            type="email"
            autoComplete="email"
            required
            placeholder={t("auth:login.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            type="password"
            autoComplete="current-password"
            required
            placeholder={t("auth:login.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <div className="text-caption text-danger-text">{error}</div> : null}
          <Button type="submit" disabled={submitting} className="mt-sm">
            {submitting ? t("common:states.loading") : t("common:actions.signIn")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
