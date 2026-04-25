import { TextInput } from "react-native";
import type { TextInputProps } from "react-native";
import { forwardRef } from "react";

export const Input = forwardRef<TextInput, TextInputProps & { className?: string }>(
  ({ className = "", ...props }, ref) => (
    <TextInput
      ref={ref}
      placeholderTextColor="rgba(0,0,0,0.35)"
      className={`h-12 w-full rounded-lg border border-line-secondary bg-bg-primary px-lg text-title text-fg-primary ${className}`}
      {...props}
    />
  ),
);
Input.displayName = "Input";
