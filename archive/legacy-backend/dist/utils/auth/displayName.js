"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.displayName = displayName;
function displayName(user) {
    return `${user.firstName} ${user.lastName}`.trim();
}
