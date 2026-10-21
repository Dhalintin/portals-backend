/** Portals defaults when school has not customized */
export const BRAND_DEFAULTS = {
  primaryColor: "#0A1628",
  accentColor: "#C9A227",
} as const;

export function resolveColors(primary?: string | null, accent?: string | null) {
  return {
    primaryColor: primary?.trim() || BRAND_DEFAULTS.primaryColor,
    accentColor: accent?.trim() || BRAND_DEFAULTS.accentColor,
  };
}
