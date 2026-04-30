import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, Modal, FlatList, Dimensions } from "react-native";
import { Search, X, ChevronDown, Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/lib/theme";

export interface DropdownItem {
  id: string;
  /** Primary text shown in the row + the trigger button when selected. */
  label: string;
  /** Optional secondary text shown beneath the label (smaller, fg-secondary). */
  meta?: string | null;
  /** Optional left-side icon node (variety thumb, batch tint, etc). */
  leading?: React.ReactNode;
}

interface Props {
  /** Currently selected item's id; null = nothing selected (placeholder shown). */
  value: string | null;
  onChange: (id: string | null) => void;
  options: DropdownItem[];
  placeholder: string;
  /** Optional empty-list label when search returns nothing. */
  noResultsLabel?: string;
  /** When true, the trigger button shows a red border to signal validation failure. */
  invalid?: boolean;
  /** Allows optional fields to be cleared after a selection. */
  clearable?: boolean;
}

const SHEET_HEIGHT = Math.round(Dimensions.get("window").height * 0.75);
const SWIPE_DISMISS_THRESHOLD = SHEET_HEIGHT * 0.25;
const SWIPE_VELOCITY_THRESHOLD = 800;
const ANIMATION_DURATION = 220;

/**
 * Inline dropdown with typeahead search. Tap the trigger button to open
 * a slide-up bottom sheet, type to filter, tap a row to commit. The sheet
 * can be dismissed three ways: tapping the dim backdrop, tapping the
 * close pill at the top-left, or swiping the sheet down past ~25% of its
 * height (or any flick exceeding 800 px/s).
 *
 * Replaces our previous "open a dedicated picker route" pattern (e.g.
 * /capture/variety-picker.tsx) — keeps the user in-context on the parent
 * form and avoids an extra route per picker.
 *
 * Animation is driven by Reanimated rather than `Modal animationType="slide"`
 * because the built-in slide animates the entire modal contents as one
 * unit, which made the dim backdrop pop in at full opacity at frame 0
 * (visible flicker). Driving translateY + backdrop opacity from a single
 * shared value keeps both in lockstep.
 */
export function DropdownSearch({
  value,
  onChange,
  options,
  placeholder,
  noResultsLabel,
  invalid = false,
  clearable = false,
}: Props) {
  const { t } = useTranslation("common");
  const { resolved } = useTheme();
  const closeIconColor = resolved === "dark" ? "#F5F5F4" : "#1A1A1A";
  const [open, setOpen] = useState(false);
  // `mounted` keeps the Modal in the tree while the close animation plays.
  // Without it, setting `open=false` would unmount the Modal mid-tween and
  // we'd snap to closed instead of sliding out.
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");

  // 0 = fully closed (sheet offscreen), 1 = fully open. translateY and
  // backdrop opacity both interpolate off this single shared value so the
  // backdrop fades in/out exactly in sync with the sheet.
  const progress = useSharedValue(0);
  // Live finger drag offset while the user is dragging the sheet down.
  // Stays at 0 except during an active pan.
  const dragY = useSharedValue(0);

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Reset the query when the modal closes — opening fresh shouldn't
  // remember the last typed text.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Drive open/close animation. On open we mount immediately and tween up;
  // on close we tween down then unmount via the animation callback so the
  // Modal stays in the tree until the slide-out finishes.
  useEffect(() => {
    if (open) {
      setMounted(true);
      dragY.value = 0;
      progress.value = withTiming(1, {
        duration: ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }
    if (mounted) {
      progress.value = withTiming(
        0,
        { duration: ANIMATION_DURATION, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
  }, [open, mounted, progress, dragY]);

  const closeFromGesture = () => setOpen(false);

  // Vertical pan on the sheet. Drag down translates the sheet (and fades
  // the backdrop in concert); release past either threshold dismisses,
  // otherwise we spring back up to the open position.
  const panGesture = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetY(-12)
    .onUpdate((event) => {
      "worklet";
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      "worklet";
      const shouldDismiss =
        event.translationY > SWIPE_DISMISS_THRESHOLD || event.velocityY > SWIPE_VELOCITY_THRESHOLD;
      if (shouldDismiss) {
        // Snap drag offset back to 0 so the slide-out tween starts from
        // its baseline — `progress` going to 0 then drives the actual exit.
        dragY.value = withTiming(0, { duration: 80 });
        runOnJS(closeFromGesture)();
      } else {
        dragY.value = withTiming(0, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
        });
      }
    });

  const sheetStyle = useAnimatedStyle(() => {
    const baseOffset = interpolate(progress.value, [0, 1], [SHEET_HEIGHT, 0]);
    return { transform: [{ translateY: baseOffset + dragY.value }] };
  });

  const backdropStyle = useAnimatedStyle(() => {
    // Fade backdrop with the sheet position so a partial drag-down
    // visibly weakens the dim — gives the gesture a sense of weight.
    const dragFade = 1 - Math.min(dragY.value / SHEET_HEIGHT, 1);
    return { opacity: progress.value * 0.45 * dragFade };
  });

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        className={`flex-row items-center gap-md rounded-xl bg-bg-primary border px-md py-md ${
          invalid ? "border-danger-text" : "border-line-tertiary"
        }`}
      >
        {selected?.leading ?? null}
        <View className="flex-1">
          {selected ? (
            <>
              <Text className="text-body text-fg-primary" numberOfLines={1}>
                {selected.label}
              </Text>
              {selected.meta ? (
                <Text className="text-caption text-fg-secondary" numberOfLines={1}>
                  {selected.meta}
                </Text>
              ) : null}
            </>
          ) : (
            <Text className="text-body text-fg-tertiary">{placeholder}</Text>
          )}
        </View>
        {clearable && selected ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("actions.clear")}
            className="h-7 w-7 items-center justify-center rounded-full bg-bg-tertiary"
            onPress={(event) => {
              event.stopPropagation();
              onChange(null);
            }}
          >
            <X color="#6B6B68" size={14} />
          </Pressable>
        ) : (
          <ChevronDown color="#9D9D9A" size={16} />
        )}
      </Pressable>

      {mounted ? (
        <Modal
          visible={mounted}
          // We drive the slide ourselves via Reanimated so React Native's
          // native modal transitions don't double-up and flicker the
          // backdrop in at full strength on the first frame.
          animationType="none"
          transparent
          onRequestClose={() => setOpen(false)}
        >
          <View className="flex-1">
            <Animated.View
              pointerEvents={open ? "auto" : "none"}
              style={[
                {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "#000",
                },
                backdropStyle,
              ]}
            >
              <Pressable
                accessibilityLabel={t("actions.cancel")}
                onPress={() => setOpen(false)}
                style={{ flex: 1 }}
              />
            </Animated.View>

            <GestureDetector gesture={panGesture}>
              <Animated.View
                className="absolute inset-x-0 bottom-0 bg-bg-secondary rounded-t-2xl"
                style={[{ height: SHEET_HEIGHT }, sheetStyle]}
              >
                {/* Drag-handle affordance — also the visual cue that the
                    sheet supports the swipe-down-to-close gesture. */}
                <View className="items-center pt-sm pb-xs">
                  <View className="h-1 w-10 rounded-full bg-line-secondary" />
                </View>
                <View className="flex-row items-center gap-md px-xl pt-sm pb-md">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("actions.cancel")}
                    onPress={() => setOpen(false)}
                    className="h-9 w-9 items-center justify-center rounded-full bg-bg-tertiary"
                  >
                    <X color={closeIconColor} size={18} />
                  </Pressable>
                  <View className="flex-1 flex-row items-center gap-sm rounded-xl bg-bg-primary border border-line-tertiary px-md py-sm">
                    <Search color="#9D9D9A" size={16} />
                    <TextInput
                      autoFocus
                      placeholder={placeholder}
                      placeholderTextColor="#9D9D9A"
                      value={query}
                      onChangeText={setQuery}
                      className="flex-1 text-body text-fg-primary"
                    />
                    {query ? (
                      <Pressable
                        onPress={() => setQuery("")}
                        accessibilityLabel={t("actions.cancel")}
                      >
                        <X color="#9D9D9A" size={16} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <FlatList
                  data={filtered}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item, index }) => (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        onChange(item.id);
                        setOpen(false);
                      }}
                      className={`flex-row items-center gap-md px-xl py-md ${
                        index === 0 ? "" : "border-t border-line-tertiary"
                      }`}
                    >
                      {item.leading ?? null}
                      <View className="flex-1">
                        <Text className="text-title text-fg-primary font-medium" numberOfLines={1}>
                          {item.label}
                        </Text>
                        {item.meta ? (
                          <Text className="text-caption text-fg-secondary" numberOfLines={1}>
                            {item.meta}
                          </Text>
                        ) : null}
                      </View>
                      {item.id === value ? <Check color="#0F6E56" size={18} /> : null}
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <View className="py-2xl items-center">
                      <Text className="text-body text-fg-secondary">
                        {noResultsLabel ?? t("states.noResults")}
                      </Text>
                    </View>
                  }
                />
              </Animated.View>
            </GestureDetector>
          </View>
        </Modal>
      ) : null}
    </>
  );
}
