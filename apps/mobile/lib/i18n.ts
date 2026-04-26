import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { resources, defaultLocale, namespaces } from "@advance-seeds/i18n";
import type { SupportedLocale } from "@advance-seeds/i18n";

const STORAGE_KEY = "as.mobile.locale";

async function detectInitialLocale(): Promise<SupportedLocale> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "th") return saved;
  } catch {
    // ignore
  }
  const device = Localization.getLocales()[0]?.languageCode;
  if (device === "th") return "th";
  return defaultLocale;
}

export async function bootstrapI18n() {
  const initial = await detectInitialLocale();
  await i18n.use(initReactI18next).init({
    resources,
    lng: initial,
    fallbackLng: defaultLocale,
    supportedLngs: ["en", "th"],
    ns: [...namespaces],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    // Hermes (Expo's JS runtime) doesn't ship Intl.PluralRules. v3 plurals
    // use a lookup-table format that doesn't depend on Intl. The dashboard
    // (web) ships Intl natively so it doesn't need this — the override is
    // safe because v3 covers EN + TH plural rules correctly.
    compatibilityJSON: "v3",
  });
  i18n.on("languageChanged", (lng) => {
    void AsyncStorage.setItem(STORAGE_KEY, lng);
  });
}

export default i18n;
