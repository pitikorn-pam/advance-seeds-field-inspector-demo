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
 * Standalone read-only profile screen. The visual layer mirrors the Field
 * Inspector redesign prototype: hero card (avatar + name + role chip), a
 * three-up read-only stat grid, then a meta list (email / device / app
 * version). Auth wiring and queries are untouched — the stats lean on the
 * existing `useInspections` query and sync queue read.
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

  // Read-only stats derived from already-fetched data — no new auth/profile
  // wiring. `useInspections` is shared with the home + history screens.
  const inspectionsCount = inspections?.length ?? 0;
  const seedsTotal = (inspections ?? []).reduce((sum, row) => sum + (row.total_seeds ?? 0), 0);
  const completeCount = (inspections ?? []).filter((row) => row.status === "complete").length;
  const syncRate =
    inspectionsCount === 0 ? "—" : `${Math.round((completeCount / inspectionsCount) * 100)}%`;

  const appVersion = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "—";
  const deviceName = Constants.deviceName ?? "—";

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
      <ScrollView contentContainerClassName="px-xl py-md gap-lg">
        {/* Hero */}
        <Card className="items-center py-xl">
          <View className="items-center justify-center mb-md h-[80px] w-[80px] rounded-full bg-card-lavender">
            <Text
              className="font-medium text-primary-deep"
              style={{ fontSize: 26, letterSpacing: -0.5 }}
            >
              {initials}
            </Text>
          </View>
          <Text
            className="text-fg-primary font-medium"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {profile?.full_name ?? "—"}
          </Text>
          {profile?.email ? (
            <Text className="text-caption text-fg-secondary mt-xs">{profile.email}</Text>
          ) : null}
          {role ? (
            <View className="mt-md">
              <RolePill role={role} />
            </View>
          ) : null}
        </Card>

        {/* Stat grid */}
        <View>
          <Text
            className="text-label uppercase text-fg-secondary px-xs pb-sm"
            style={{ letterSpacing: 0.4 }}
          >
            {t("profile:statsHeading")}
          </Text>
          <View className="flex-row gap-sm">
            <StatTile value={String(inspectionsCount)} label={t("profile:stats.inspections")} />
            <StatTile value={formatCount(seedsTotal)} label={t("profile:stats.seeds")} />
            <StatTile value={syncRate} label={t("profile:stats.syncRate")} />
          </View>
        </View>

        {/* Meta list */}
        <View>
          <Text
            className="text-label uppercase text-fg-secondary px-xs pb-sm"
            style={{ letterSpacing: 0.4 }}
          >
            {t("profile:meta.heading")}
          </Text>
          <Card className="p-0">
            <MetaRow label={t("profile:meta.email")} value={profile?.email ?? "—"} />
            <Divider />
            <MetaRow label={t("profile:meta.device")} value={deviceName} />
            <Divider />
            <MetaRow label={t("profile:meta.appVersion")} value={appVersion} last />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 rounded-lg border border-line-tertiary bg-bg-primary px-md py-md items-center">
      <Text className="text-fg-primary font-medium" style={{ fontSize: 20, letterSpacing: -0.3 }}>
        {value}
      </Text>
      <Text
        className="mt-xs text-label uppercase text-fg-secondary text-center"
        style={{ letterSpacing: 0.4 }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function MetaRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View className={`flex-row items-center px-lg py-md ${last ? "" : ""}`}>
      <Text className="text-body text-fg-primary flex-1">{label}</Text>
      <Text className="text-caption text-fg-secondary" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View className="h-[0.5px] bg-line-tertiary mx-lg" />;
}

function formatCount(n: number) {
  if (n < 1000) return String(n);
  return n.toLocaleString("en-US");
}
