import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { supportedLocales } from "@advance-seeds/i18n";
import type { SupportedLocale } from "@advance-seeds/i18n";
import { Button } from "../ui/button";

export function LocaleSwitcher() {
  const { i18n, t } = useTranslation();
  const change = async (lng: SupportedLocale) => {
    await i18n.changeLanguage(lng);
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("fields.language")}>
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="end"
          className="z-50 min-w-[160px] rounded-lg border border-line-tertiary bg-bg-primary p-xs shadow-lg"
        >
          {supportedLocales.map((lng) => (
            <DropdownMenu.Item
              key={lng}
              onSelect={() => void change(lng)}
              className="cursor-pointer rounded-md px-md py-sm text-body text-fg-primary outline-none data-[highlighted]:bg-bg-secondary"
            >
              {t(`languages.${lng}`)}
              {i18n.language.startsWith(lng) ? " ✓" : ""}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
