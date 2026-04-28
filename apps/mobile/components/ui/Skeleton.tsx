import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import type { ViewStyle } from "react-native";

interface Props {
  /** Style overrides — typically `{ height, width, borderRadius }`. */
  style?: ViewStyle;
}

/**
 * Pulsing rectangle placeholder for loading states. Mirrors the prototype's
 * preferred shimmer treatment without pulling in a shimmer library —
 * Animated.loop on opacity is enough for a "this content is loading"
 * read.
 *
 * Use the same dimensions as the real content so the layout doesn't
 * jump when data arrives. For card lists, render a stack of skeletons
 * matching the row height; for the home hero, match the card.
 */
export function Skeleton({ style }: Props) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          backgroundColor: "rgba(0,0,0,0.06)",
          borderRadius: 12,
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * Convenience: stack of skeleton rows with consistent gap, used for list
 * placeholder treatments. Default 3 rows × 64 px tall mirrors a typical
 * Card-with-list-rows shape.
 */
export function SkeletonList({ rows = 3, rowHeight = 64 }: { rows?: number; rowHeight?: number }) {
  return (
    <View className="gap-sm">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} style={{ height: rowHeight }} />
      ))}
    </View>
  );
}
