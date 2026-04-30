import { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Sprout, UserRound } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Panel = "inspector" | "admin";

interface DemoAccount {
  email: string;
  password: string;
  badge: string;
  hint: string;
}

const DEMO_ACCOUNTS: Record<Panel, DemoAccount> = {
  inspector: {
    email: "jane@advanceseeds.com",
    password: "DemoSeeds2026!",
    badge: "Inspector",
    hint: "Field inspector — can capture, analyze, and review own inspections.",
  },
  admin: {
    email: "alex@advanceseeds.com",
    password: "DemoSeeds2026!",
    badge: "Admin",
    hint: "Admin — manages varieties, batches, and capture-class master data.",
  },
};

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
    // Pre-fill demo creds when switching, so each panel works as a one-tap
    // sign-in for QA. The user can still type over either field.
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
    <SafeAreaView className="flex-1 bg-bg-secondary">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-center px-xl"
      >
        <View className="rounded-xl bg-bg-primary px-xl py-2xl gap-md">
          <View className="flex-row items-center gap-sm">
            <Sprout color="#0F6E56" size={24} />
            <Text className="text-h2 font-medium text-fg-primary">{t("common:appName")}</Text>
          </View>
          <Text className="text-display font-medium text-fg-primary mt-md">
            {t("auth:login.title")}
          </Text>
          <Text className="text-body text-fg-secondary">{t("auth:login.subtitle")}</Text>

          <View className="flex-row gap-sm mt-md">
            <RolePanel
              icon={<UserRound color={panel === "inspector" ? "#FFFFFF" : "#0F6E56"} size={18} />}
              label={t("auth:login.panel.inspector")}
              hint={t("auth:login.panel.inspectorHint")}
              active={panel === "inspector"}
              onPress={() => switchPanel("inspector")}
            />
            <RolePanel
              icon={<ShieldCheck color={panel === "admin" ? "#FFFFFF" : "#0F6E56"} size={18} />}
              label={t("auth:login.panel.admin")}
              hint={t("auth:login.panel.adminHint")}
              active={panel === "admin"}
              onPress={() => switchPanel("admin")}
            />
          </View>

          <View className="gap-md mt-md">
            <Input
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder={t("auth:login.emailPlaceholder")}
              value={email}
              onChangeText={setEmail}
            />
            <Input
              secureTextEntry
              placeholder={t("auth:login.passwordPlaceholder")}
              value={password}
              onChangeText={setPassword}
            />
            {error ? <Text className="text-caption text-danger-text">{error}</Text> : null}
            <Button
              label={submitting ? t("common:states.loading") : t("common:actions.signIn")}
              disabled={submitting}
              onPress={onSubmit}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RolePanel({
  icon,
  label,
  hint,
  active,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`flex-1 rounded-xl px-md py-md gap-xs ${
        active ? "bg-brand active:opacity-90" : "bg-bg-secondary border border-line-tertiary"
      }`}
    >
      <View className="flex-row items-center gap-xs">
        {icon}
        <Text className={`text-title font-medium ${active ? "text-brand-on" : "text-fg-primary"}`}>
          {label}
        </Text>
      </View>
      <Text
        className={`text-caption ${active ? "text-brand-on opacity-85" : "text-fg-secondary"}`}
        numberOfLines={2}
      >
        {hint}
      </Text>
    </Pressable>
  );
}
