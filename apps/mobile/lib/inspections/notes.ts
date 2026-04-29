export function displayInspectionNote(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
