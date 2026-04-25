import { useTranslation } from "react-i18next";
import { Moon, Sun, Laptop } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { Theme } from "@advance-seeds/types";
import { useTheme } from "@/lib/theme";
import { Button } from "../ui/button";

const Icon = ({ theme }: { theme: Theme }) => {
  if (theme === "dark") return <Moon className="h-4 w-4" />;
  if (theme === "light") return <Sun className="h-4 w-4" />;
  return <Laptop className="h-4 w-4" />;
};

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("fields.theme")}>
          <Icon theme={theme} />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="end"
          className="z-50 min-w-[160px] rounded-lg border border-line-tertiary bg-bg-primary p-xs shadow-lg"
        >
          {(["light", "dark", "system"] as const).map((t2) => (
            <DropdownMenu.Item
              key={t2}
              onSelect={() => setTheme(t2)}
              className="cursor-pointer rounded-md px-md py-sm text-body text-fg-primary outline-none data-[highlighted]:bg-bg-secondary"
            >
              {t(`themes.${t2}`)}
              {theme === t2 ? " ✓" : ""}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
