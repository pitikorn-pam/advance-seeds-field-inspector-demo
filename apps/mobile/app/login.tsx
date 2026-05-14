import { useState } from "react";
import { ScrollView, View, Text, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Info, AlertCircle } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Panel = "inspector" | "admin";

interface DemoAccount {
  email: string;
  password: string;
  badge: string;
}

const DEMO_ACCOUNTS: Record<Panel, DemoAccount> = {
  inspector: {
    email: "jane@advanceseeds.com",
    password: "DemoSeeds2026!",
    badge: "Inspector",
  },
  admin: {
    email: "alex@advanceseeds.com",
    password: "DemoSeeds2026!",
    badge: "Admin",
  },
};

/**
 * Sign-in screen — ported 1:1 from `auth.jsx > LoginScreen`:
 *   - White-on-white surface (no card framing).
 *   - 40px purple AS brand mark, "Sign in" h1, "Field Inspector · demo build" body.
 *   - "Demo role" uppercase caption + segmented Inspector/Admin chooser on a
 *     subtle cream track (active option gets a white pill with hairline).
 *   - Email + Password fields with uppercase caption labels; error state
 *     surfaces an AlertCircle + message inline below the password.
 *   - Cream "info tip" box explaining the demo pre-fill.
 *   - Footer: full-width "Sign in as {role}" primary + "Forgot password" ghost.
 */
export default function LoginScreen() {
  const { t } = useTranslation(["auth", "common"]);
  const [panel, setPanel] = useState<Panel>("inspector");
  const [email, setEmail] = useState(DEMO_ACCOUNTS.inspector.email);
  const [password, setPassword] = useState(DEMO_ACCOUNTS.inspector.password);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchPanel = (next: Panel) => {
    if (panel === next) return;
    setPanel(next);
    setEmail(DEMO_ACCOUNTS[next].email);
    setPassword(DEMO_ACCOUNTS[next].password);
    setError(null);
  };

  const onSubmit = async () => {
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (err) setError(t("auth:login.errorInvalid"));
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-primary">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView contentContainerClassName="flex-grow" keyboardShouldPersistTaps="handled">
          {/* Header — brand mark + sign-in title */}
          <View className="px-2xl pt-3xl pb-sm">
            <BrandMark />
            <Text
              className="mt-lg font-semibold text-fg-primary"
              style={{ fontSize: 28, letterSpacing: -0.5 }}
            >
              {t("auth:login.title")}
            </Text>
            <Text className="mt-[2px] text-body text-fg-secondary">{t("auth:login.subtitle")}</Text>
          </View>

          {/* Form body */}
          <View className="flex-1 px-2xl pt-lg gap-md">
            <View>
              <Caption>{t("auth:login.roleLabel")}</Caption>
              <RoleSegmented value={panel} onChange={switchPanel} />
            </View>

            <View>
              <Caption>{t("auth:login.emailLabel")}</Caption>
              <Input
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder={t("auth:login.emailPlaceholder")}
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View>
              <Caption>{t("auth:login.passwordLabel")}</Caption>
              <Input
                secureTextEntry
                placeholder={t("auth:login.passwordPlaceholder")}
                value={password}
                onChangeText={setPassword}
              />
              {error ? (
                <View className="mt-sm flex-row items-start gap-xs">
                  <AlertCircle color="#A02828" size={14} />
                  <Text className="flex-1 text-caption text-error">{error}</Text>
                </View>
              ) : null}
            </View>

            {/* Cream info tip — prototype's pre-fill explainer */}
            <View className="mt-md flex-row gap-sm rounded-md border border-line-tertiary bg-card-cream px-md py-md">
              <Info color="#B85518" size={14} style={{ marginTop: 2 }} />
              <Text className="flex-1 text-caption text-fg-primary">
                {t("auth:login.demoNote")}
              </Text>
            </View>
          </View>

          {/* Footer CTAs */}
          <View className="px-2xl pb-xl pt-md gap-sm">
            <Button
              label={
                submitting
                  ? t("common:states.loading")
                  : t("auth:login.submitAs", { role: DEMO_ACCOUNTS[panel].badge })
              }
              disabled={submitting}
              onPress={onSubmit}
            />
            <Pressable accessibilityRole="button" className="h-9 items-center justify-center">
              <Text className="text-[12px] text-fg-tertiary">{t("auth:login.forgot")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mb-xs text-[11px] uppercase tracking-[0.6px] font-semibold text-fg-tertiary">
      {children}
    </Text>
  );
}

/**
 * Cream-track segmented chooser — active option floats a white pill with
 * a hairline + soft shadow, matching the prototype's role selector.
 */
function RoleSegmented({ value, onChange }: { value: Panel; onChange: (p: Panel) => void }) {
  const { t } = useTranslation(["auth"]);
  const options: Array<{ key: Panel; label: string }> = [
    { key: "inspector", label: t("auth:login.panel.inspector") },
    { key: "admin", label: t("auth:login.panel.admin") },
  ];
  return (
    <View className="flex-row gap-[4px] rounded-lg bg-bg-secondary p-[4px]" style={{ height: 44 }}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.key)}
            className={`flex-1 items-center justify-center rounded-md ${
              active ? "bg-bg-primary border border-line-tertiary" : ""
            }`}
            style={
              active
                ? {
                    shadowColor: "#0F0F0F",
                    shadowOpacity: 0.06,
                    shadowRadius: 2,
                    shadowOffset: { width: 0, height: 1 },
                  }
                : undefined
            }
          >
            <Text
              className={`text-[13px] ${
                active ? "font-semibold text-fg-primary" : "font-medium text-fg-secondary"
              }`}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BrandMark() {
  return (
    <View
      className="items-center justify-center rounded-lg bg-primary"
      style={{
        width: 40,
        height: 40,
        shadowColor: "#6E40E0",
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      }}
    >
      <Text
        className="text-primary-on"
        style={{ fontSize: 15, fontWeight: "700", letterSpacing: -0.6 }}
      >
        AS
      </Text>
    </View>
  );
}
