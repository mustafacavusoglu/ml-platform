export function deriveProjectName(workbenchName: string | undefined): string | undefined {
  const trimmed = workbenchName?.trim();
  if (!trimmed) {
    return undefined;
  }

  const parts = trimmed.split('-').filter((part) => part.length > 0);
  if (parts.length < 2) {
    return undefined;
  }

  return parts.slice(0, -1).join('-');
}
