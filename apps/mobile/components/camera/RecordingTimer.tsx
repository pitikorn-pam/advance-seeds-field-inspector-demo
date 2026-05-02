import { useEffect, useRef } from "react";
import { Animated, View, Text } from "react-native";
import { glass } from "@advance-seeds/tokens";

interface Props {
  /** Active duration in ms — when null, the timer is hidden. */
  durationMs: number | null;
}

/**
 * Floating MM:SS pill anchored at the top of the viewfinder during a
 * recording. The leading red dot pulses once per second to read as a
 * "live indicator" without requiring constant re-renders from the parent.
 */
export function RecordingTimer({ durationMs }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (durationMs === null) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [durationMs, pulse]);

  if (durationMs === null) return null;

  const totalSec = Math.floor(durationMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const label = `${m}:${s.toString().padStart(2, "0")}`;

  return (
    <View className="items-center mt-xs" pointerEvents="none">
      <View
        className="flex-row items-center gap-xs rounded-full px-md py-xs"
        style={{ backgroundColor: glass.surface }}
      >
        <Animated.View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: "#DC2828",
            opacity: pulse,
          }}
        />
        <Text className="text-white font-medium" style={{ fontSize: 12, letterSpacing: 0.4 }}>
          {label}
        </Text>
      </View>
    </View>
  );
}
