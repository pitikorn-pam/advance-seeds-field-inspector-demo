import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useAuth } from "@/lib/auth";
import { Button } from "../ui/button";

export function UserMenu() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (!profile) return null;

  const initials = (profile.full_name ?? profile.email)
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("");

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="tinted"
          size="icon"
          className="rounded-full"
          aria-label={profile.full_name ?? profile.email}
        >
          <span className="text-caption font-medium">{initials}</span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="end"
          className="z-50 min-w-[200px] rounded-lg border border-line-tertiary bg-bg-primary p-xs shadow-lg"
        >
          <div className="px-md py-sm">
            <div className="text-title text-fg-primary">{profile.full_name ?? profile.email}</div>
            <div className="text-caption text-fg-secondary">{t(`roles.${profile.role}`)}</div>
          </div>
          <div className="my-xs h-px bg-line-tertiary" />
          <DropdownMenu.Item asChild>
            <Link
              to="/settings"
              className="cursor-pointer rounded-md px-md py-sm text-body text-fg-primary outline-none data-[highlighted]:bg-bg-secondary"
            >
              {t("nav.settings")}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={async () => {
              await signOut();
              navigate("/login", { replace: true });
            }}
            className="cursor-pointer rounded-md px-md py-sm text-body text-fg-primary outline-none data-[highlighted]:bg-bg-secondary"
          >
            {t("actions.signOut")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
