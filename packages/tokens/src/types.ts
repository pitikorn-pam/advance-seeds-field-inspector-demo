// Subset of the JSON token schema we actually consume.
// Mirrors docs/handoff/design-tokens.json — keep aligned.

export type ColorPair = { value: string; darkValue?: string; description?: string };
export type SemanticPair = { bg: { value: string }; text: { value: string } };
export type VarietyPair = { bg: string; text: string };
export type GlassPair = { value: string; description?: string };

export interface DesignTokensJson {
  metadata: { name: string; version: string; description: string };
  color: {
    brand: { primary: ColorPair; soft: ColorPair; deep: ColorPair };
    background: { primary: ColorPair; secondary: ColorPair; tertiary: ColorPair };
    text: { primary: ColorPair; secondary: ColorPair; tertiary: ColorPair };
    border: { tertiary: ColorPair; secondary: ColorPair; primary: ColorPair };
    semantic: {
      success: SemanticPair;
      warning: SemanticPair;
      danger: SemanticPair;
      info: SemanticPair;
    };
    variety: Record<string, VarietyPair | string>;
    glass: Record<string, GlassPair | string>;
  };
  typography: {
    fontFamily: { sans: { value: string }; mono: { value: string } };
    scale: Record<
      string,
      { size: number; weight: number; lineHeight: number; letterSpacing: string }
    >;
  };
  spacing: Record<string, { value: number }>;
  radius: Record<string, { value: number }>;
  component: Record<string, Record<string, number>>;
  motion: {
    duration: Record<string, { value: number }>;
    easing: Record<string, { value: string }>;
  };
}
