export function validateWildberriesToolsRequirements(
  includeWildberriesTools: boolean,
  userId?: string
): void {
  if (includeWildberriesTools && !userId) {
    throw new Error('userId is required when includeWildberriesTools is true');
  }
}