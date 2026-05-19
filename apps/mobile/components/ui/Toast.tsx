import { useEffect, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";

interface Props {
  /** Visible message. When null, the toast hides. */
  message: string | null;
  /** ms before auto-dismissing. Defaults to 1800. */
  duration?: number;
  /** Tone — neutral (default) is a glass-style dark pill, success is brand-tinted. */
  tone?: "neutral" | "success" | "danger";
  /**
   * Optional inline action button (e.g. "Undo"). When provided the toast
   * renders as a wider charcoal card with the action on the right and
   * stays interactive until auto-dismiss.
   */
  actionLabel?: string;
  /** Invoked when the action button is tapped. Does not auto-dismiss the toast. */
  onAction?: () => void;
}

/**
 * Lightweight in-screen toast. Anchors near the top of the visible area
 * (caller controls position via wrapper); fades in on mount and fades out
 * after `duration`. We use this instead of `Alert.alert` for low-importance
 * confirmations (snapshot saved, etc) — Alert is intrusive and has its
 * own dismiss flow.
 *
 * Usage:
 *   const [toast, setToast] = useState<string | null>(null);
 *   <Toast message={toast} />
 *   onPress={() => setToast(t("...savedToast"))}
 *
 * The component handles its own auto-clear via parent state — caller
 * doesn't need to setTimeout-clear.
 */
export function Toast({
  message,
  duration = 1800,
  tone = "neutral",
  actionLabel,
  onAction,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) {
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
      return;
    }
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const handle = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }, duration);
    return () => clearTimeout(handle);
  }, [message, duration, opacity]);

  if (!message) return null;

  const bg =
    tone === "success"
      ? "rgba(15, 110, 86, 0.92)"
      : tone === "danger"
        ? "rgba(121, 31, 31, 0.92)"
        : "rgba(0, 0, 0, 0.78)";

  const hasAction = !!actionLabel && !!onAction;

  return (
    <Animated.View
      // Action toasts need taps; passive toasts stay non-interactive so they
      // don't block content underneath.
      pointerEvents={hasAction ? "box-none" : "none"}
      style={{
        opacity,
        position: "absolute",
        top: 60,
        left: 0,
        right: 0,
        alignItems: "center",
        paddingHorizontal: 16,
      }}
    >
      {hasAction ? (
        <View
          style={{
            backgroundColor: "#191918",
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            width: "100%",
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowOffset: { width: 0, height: 8 },
            shadowRadius: 24,
            elevation: 8,
          }}
        >
          <Text
            style={{ color: "white", fontSize: 13, fontWeight: "500", flex: 1 }}
            numberOfLines={2}
          >
            {message}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            hitSlop={8}
          >
            <Text style={{ color: "#9F90F5", fontSize: 13, fontWeight: "600" }}>{actionLabel}</Text>
          </Pressable>
        </View>
      ) : (
        <View
          style={{
            backgroundColor: bg,
            borderRadius: 999,
            paddingVertical: 8,
            paddingHorizontal: 16,
            maxWidth: "85%",
          }}
        >
          <Text style={{ color: "white", fontSize: 13, fontWeight: "500", textAlign: "center" }}>
            {message}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}
