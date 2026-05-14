import { TextInput } from "react-native";
import type { TextInputProps } from "react-native";
import { forwardRef } from "react";
import { useTheme } from "@/lib/theme";

export const Input = forwardRef<TextInput, TextInputProps & { className?: string }>(
  ({ className = "", ...props }, ref) => {
    const { resolved } = useTheme();
    const placeholder = resolved === "dark" ? "rgba(247,247,245,0.42)" : "rgba(23,23,23,0.42)";
    return (
      <TextInput
        ref={ref}
        placeholderTextColor={placeholder}
        className={`h-11 w-full rounded-md border border-line-secondary bg-bg-primary px-lg text-title text-fg-primary ${className}`}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
