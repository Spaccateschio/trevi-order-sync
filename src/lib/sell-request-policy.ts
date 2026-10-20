// Explicit authorization is required before enabling real sends for this feature.
export const SELL_REQUEST_EMAILS_ENABLED = false;

export function canDisableCompanyProfile(buys: boolean, sells: boolean, profile: "buys" | "sells") {
  return profile === "buys" ? buys && sells : sells && buys;
}