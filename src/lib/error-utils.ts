export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function logError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  if (extra) {
    console.error(context, {
      ...extra,
      error: toErrorMessage(error),
    });
    return;
  }
  console.error(context, error);
}
