"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.missingGoogleDetails = missingGoogleDetails;
/** Only verified Google data fills missing fields; user edits always win. */
function missingGoogleDetails(user, profile) { return { ...(!user.firstName?.trim() && profile.firstName ? { firstName: profile.firstName } : {}), ...(!user.lastName?.trim() && profile.lastName ? { lastName: profile.lastName } : {}), ...(!user.avatarUrl?.trim() && profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}) }; }
