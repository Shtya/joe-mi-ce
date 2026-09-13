export function isCatalogUpdateDryRun(dryRun: string | undefined): boolean {
  return dryRun !== "false";
}
