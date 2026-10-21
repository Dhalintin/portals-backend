"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BRAND_DEFAULTS = void 0;
exports.resolveColors = resolveColors;
/** Portals defaults when school has not customized */
exports.BRAND_DEFAULTS = {
    primaryColor: "#0A1628",
    accentColor: "#C9A227",
};
function resolveColors(primary, accent) {
    return {
        primaryColor: primary?.trim() || exports.BRAND_DEFAULTS.primaryColor,
        accentColor: accent?.trim() || exports.BRAND_DEFAULTS.accentColor,
    };
}
