export function syncErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "error_description", "details", "hint"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) return value;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

export function isQueueableSyncError(error: unknown): boolean {
  const message = syncErrorMessage(error).toLowerCase();
  if (
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("timeout") ||
    message.includes("service unavailable")
  ) {
    return true;
  }
  if (error && typeof error === "object") {
    const status = Number((error as Record<string, unknown>).status);
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }
  return false;
}
