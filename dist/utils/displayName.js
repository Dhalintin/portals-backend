"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.displayName = displayName;
exports.displayClassName = displayClassName;
function displayName(user) {
    return `${user.firstName} ${user.lastName}`.trim();
}
function displayClassName(name, arm) {
    return arm ? `${name}${arm}` : name;
}
