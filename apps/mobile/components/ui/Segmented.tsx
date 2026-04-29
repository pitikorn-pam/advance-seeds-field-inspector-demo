import { ScrollView, View, Text, Pressable } from "react-native";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<Option<T>>;
  /** When true, the row scrolls horizontally — useful for many segments. */
  scrollable?: boolean;
  /**
   * Visual style. "filled" (default) gives both states a fill — the legacy
   * look used by the History tab. "tag" gives the selected option a brand
   * fill and unselected options a frame-only outline, so the active pick
   * reads as one highlighted tag among ghosts. The Library tab uses "tag"
   * because it's the only filter that the user explicitly described as a
   * tag-style button group.
   */
  variant?: "filled" | "tag";
}

/**
 * Horizontal segmented control. Mirrors the prototype's `.seg` element:
 * a translucent track containing equally-sized buttons, with the active
 * option getting a brand-tinted pill background and bold label.
 *
 * Generic over the value type so screens can pass typed enums (variety
 * family keys, history filter values, etc.) without string casts at the
 * call site.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  scrollable = false,
  variant = "filled",
}: Props<T>) {
  const Container = scrollable ? ScrollView : View;
  const containerProps = scrollable
    ? {
        horizontal: true,
        showsHorizontalScrollIndicator: false,
        contentContainerClassName: "gap-xs",
      }
    : { className: "flex-row gap-xs" };

  return (
    <Container {...containerProps}>
      {options.map((opt) => {
        const active = opt.value === value;
        const inactiveClass =
          variant === "tag" ? "bg-transparent border border-line-secondary" : "bg-bg-secondary";
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.value)}
            className={`px-md py-xs rounded-full ${active ? "bg-brand-soft" : inactiveClass}`}
          >
            <Text
              className={`font-medium ${active ? "text-brand-deep" : "text-fg-secondary"}`}
              style={{ fontSize: 12 }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </Container>
  );
}
