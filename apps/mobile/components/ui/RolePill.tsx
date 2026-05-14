import { useTranslation } from "react-i18next";
import { View, Text } from "react-native";

export type Role = "Inspector" | "Admin";

// Inspector → sky tint + info ink. Admin → lavender tint + primary-deep ink.
// Matches the prototype's `fi-tag-sky` / `fi-tag-purple` styling at 20px tall.
// Dot color is the text token at 60% alpha — kept as a literal so RN doesn't
// need `currentColor` (which it doesn't support).
const STYLES: Record<Role, { bg: string; text: string; dot: string }> = {
  Inspector: { bg: "bg-card-sky", text: "text-info-text", dot: "#1957A4" },
  Admin: { bg: "bg-card-lavender", text: "text-primary-deep", dot: "#4B22A8" },
};

export function RolePill({ role, className = "" }: { role: Role; className?: string }) {
  const { t } = useTranslation();
  const s = STYLES[role];
  return (
    <View
      className={`flex-row items-center gap-[4px] h-[20px] px-[6px] rounded-sm ${s.bg} ${className}`}
    >
      <View
        className="h-[5px] w-[5px] rounded-full opacity-60"
        style={{ backgroundColor: s.dot }}
      />
      <Text className={`text-[11px] font-semibold tracking-[0.2px] ${s.text}`}>
        {t(`common:roles.${role.toLowerCase()}`, role)}
      </Text>
    </View>
  );
}
