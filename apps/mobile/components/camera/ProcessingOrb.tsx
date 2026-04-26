import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

/**
 * Spinning brand-colored ring — the "we're analyzing" hero element on the
 * processing screen. Matches the prototype's `.processing-orb` (a 120px
 * circle with a 4px brand border, top-edge transparent, rotating linearly
 * over 1.4 s).
 */
export function ProcessingOrb({ size = 120 }: { size?: number }) {
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotate]);

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 4,
        borderColor: "#0F6E56",
        borderTopColor: "transparent",
        backgroundColor: "#E1F5EE",
        transform: [{ rotate: spin }],
      }}
    />
  );
}
