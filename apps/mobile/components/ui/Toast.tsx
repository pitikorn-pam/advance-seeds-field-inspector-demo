import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";

interface Props {
  /** Visible message. When null, the toast hides. */
  message: string | null;
  /** ms before auto-dismissing. Defaults to 1800. */
  duration?: number;
  /** Tone — neutral (default) is a glass-style dark pill, success is brand-tinted. */
  tone?: "neutral" | "success" | "danger";
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
export function Toast({ message, duration = 1800, tone = "neutral" }: Props) {
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

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        opacity,
        position: "absolute",
        top: 60,
        left: 0,
        right: 0,
        alignItems: "center",
      }}
    >
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
    </Animated.View>
  );
}
