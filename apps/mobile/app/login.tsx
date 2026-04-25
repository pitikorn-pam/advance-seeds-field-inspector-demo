import { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Sprout } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginScreen() {
  const { t } = useTranslation(["auth", "common"]);
  const [email, setEmail] = useState("jane@advanceseeds.com");
  const [password, setPassword] = useState("DemoSeeds2026!");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

          <View className="gap-md mt-lg">
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
