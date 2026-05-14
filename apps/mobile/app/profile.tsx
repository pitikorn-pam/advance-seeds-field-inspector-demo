import { ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { ChevronLeft } from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { useInspections } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { RolePill } from "@/components/ui/RolePill";
import { AppTopBar } from "@/components/ui/AppTopBar";

/**
 * Standalone read-only profile screen.
 *
 * Visual layer mirrors the Field Inspector redesign prototype `ProfileScreen`:
 * a centered hero Card (large round avatar + name + email + role pill),
 * an "About your role" description Card, then a three-up centered stat
 * grid (`StatTile3`). Auth wiring and queries are untouched — stats lean
 * on the existing `useInspections` query.
 */
export default function ProfileScreen() {
  const { t } = useTranslation(["common", "profile"]);
  const router = useRouter();
  const { profile } = useAuth();
  const { data: inspections } = useInspections();

  const initials =
    (profile?.full_name ?? profile?.email ?? "")
      .split(/\s+|@/)
      .map((part) => part.charAt(0).toUpperCase())
      .filter(Boolean)
      .slice(0, 2)
      .join("") || "—";

  const role: "Inspector" | "Admin" | null =
    profile?.role === "admin" ? "Admin" : profile?.role === "inspector" ? "Inspector" : null;

  const inspectionsCount = inspections?.length ?? 0;
  const seedsTotal = (inspections ?? []).reduce((sum, row) => sum + (row.total_seeds ?? 0), 0);
  const completeCount = (inspections ?? []).filter((row) => row.status === "complete").length;
  const syncRate =
    inspectionsCount === 0 ? "—" : `${Math.round((completeCount / inspectionsCount) * 100)}%`;

  const appVersion = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "—";
  const deviceName = Constants.deviceName ?? "—";

  // Description used for "About your role" — sourced from i18n with sensible
  // English defaults to avoid blank state when the key is missing.
  const roleDescription =
    role === "Admin"
      ? t(
          "profile:roleDescription.admin",
          "Admins manage varieties, model installation, and hyperparameter tuning. Inspectors and admins share the same field capture workflow.",
        )
      : t(
          "profile:roleDescription.inspector",
          "Inspectors capture inspections in the field, review measurements, and adjust grades when needed. Admin-only actions (variety editing, model installation, hyperparameter tuning) are read-only here.",
        );

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("profile:title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerClassName="px-xl pt-lg pb-xl gap-lg">
        {/* Hero card — centered avatar + name + email + role pill */}
        <Card className="p-xl items-center">
          <View
            className="items-center justify-center rounded-full bg-card-lavender"
            style={{ height: 80, width: 80 }}
          >
            <Text
              className="font-medium text-primary-deep"
              style={{ fontSize: 26, letterSpacing: -0.5 }}
            >
              {initials}
            </Text>
          </View>
          <Text
            className="text-fg-primary font-medium mt-md"
            style={{ fontSize: 17, letterSpacing: -0.2 }}
            numberOfLines={1}
          >
            {profile?.full_name ?? "—"}
          </Text>
          {profile?.email ? (
            <Text className="text-caption text-fg-secondary mt-xs">{profile.email}</Text>
          ) : null}
          {role ? (
            <View className="mt-sm">
              <RolePill role={role} />
            </View>
          ) : null}
        </Card>

        {/* About your role */}
        <View className="gap-sm">
          <Text className="text-title font-medium text-fg-primary px-xs">
            {t("profile:roleHeading", "About your role")}
          </Text>
          <Card className="p-md">
            <Text className="text-body text-fg-secondary">{roleDescription}</Text>
          </Card>
        </View>

        {/* Stat grid — last 30 days */}
        <View className="gap-sm">
          <Text className="text-title font-medium text-fg-primary px-xs">
            {t("profile:statsHeading30d", "This account · last 30 days")}
          </Text>
          <View className="flex-row gap-sm">
            <StatTile3 value={String(inspectionsCount)} label={t("profile:stats.inspections")} />
            <StatTile3 value={formatCount(seedsTotal)} label={t("profile:stats.seeds")} />
            <StatTile3 value={syncRate} label={t("profile:stats.syncRate")} />
          </View>
        </View>

        {/* Meta list — email / device / app version (kept for real account info) */}
        <View className="gap-sm">
          <Text className="text-[11px] font-semibold uppercase tracking-[0.6px] text-fg-tertiary px-xs">
            {t("profile:meta.heading")}
          </Text>
          <Card className="p-0">
            <MetaRow label={t("profile:meta.email")} value={profile?.email ?? "—"} />
            <Divider />
            <MetaRow label={t("profile:meta.device")} value={deviceName} />
            <Divider />
            <MetaRow label={t("profile:meta.appVersion")} value={appVersion} />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile3({ value, label }: { value: string; label: string }) {
  return (
    <Card className="p-md items-center flex-1">
      <Text className="text-fg-primary font-medium" style={{ fontSize: 20, letterSpacing: -0.3 }}>
        {value}
      </Text>
      <Text
        className="mt-xs text-[11px] font-semibold uppercase tracking-[0.6px] text-fg-tertiary text-center"
        numberOfLines={1}
      >
        {label}
      </Text>
    </Card>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center px-md py-md">
      <Text className="text-body font-medium text-fg-primary flex-1">{label}</Text>
      <Text className="text-caption font-medium text-fg-secondary" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View className="h-px bg-line-tertiary mx-md" />;
}

function formatCount(n: number) {
  if (n < 1000) return String(n);
  return n.toLocaleString("en-US");
}
