import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, Modal, FlatList } from "react-native";
import { Search, X, ChevronDown, Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";

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

/**
 * Inline dropdown with typeahead search. Tap the trigger button to open
 * a full-screen modal sheet, type to filter, tap a row to commit.
 *
 * Replaces our previous "open a dedicated picker route" pattern (e.g.
 * /capture/variety-picker.tsx) — keeps the user in-context on the parent
 * form and avoids an extra route per picker.
 *
 * Generic over identifier strings; callers map their domain rows to
 * DropdownItem before passing them in. Leading slot lets variety rows
 * show a colored thumb without coupling this component to variety
 * tokens.
 *
 * Search is case-insensitive over `label` only by default — meta lines
 * (like "11.4 × 4.6 mm") aren't typically what users search by. If a
 * caller needs both, they can pre-concatenate into the label.
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

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

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 bg-bg-secondary">
          {/* Header — search input + close. We use TextInput with autofocus
              so users can start typing immediately on open. */}
          <View className="flex-row items-center gap-md px-xl pt-xl pb-md">
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
                <Pressable onPress={() => setQuery("")} accessibilityLabel={t("actions.cancel")}>
                  <X color="#9D9D9A" size={16} />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("actions.cancel")}
              onPress={() => setOpen(false)}
              className="h-9 w-9 items-center justify-center rounded-full bg-bg-tertiary"
            >
              <X color="#1A1A1A" size={18} />
            </Pressable>
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
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
        </View>
      </Modal>
    </>
  );
}
