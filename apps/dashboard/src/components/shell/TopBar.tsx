import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sprout } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { SyncPill } from "./SyncPill";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { UserMenu } from "./UserMenu";

const navLinks = [
  { to: "/", labelKey: "nav.home" as const },
  { to: "/inspections", labelKey: "nav.inspections" as const },
  { to: "/varieties", labelKey: "nav.varieties" as const },
  { to: "/batches", labelKey: "nav.batches" as const },
  { to: "/reports", labelKey: "nav.reports" as const },
];

export function TopBar() {
  const { t } = useTranslation("common");
  const { profile } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-line-tertiary bg-bg-primary/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-lg px-xl">
        <NavLink to="/" className="flex items-center gap-sm text-fg-primary">
          <Sprout className="h-5 w-5 text-brand" />
          <span className="text-title font-medium">{t("appName")}</span>
        </NavLink>

        <nav className="hidden items-center gap-md md:flex">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-md py-xs text-body text-fg-secondary hover:text-fg-primary",
                  isActive && "bg-bg-secondary text-fg-primary",
                )
              }
            >
              {t(link.labelKey)}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-sm">
          <SyncPill />
          <LocaleSwitcher />
          <ThemeSwitcher />
          {profile ? <UserMenu /> : null}
        </div>
      </div>
    </header>
  );
}
