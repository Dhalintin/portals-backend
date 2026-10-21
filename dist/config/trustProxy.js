"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTrustProxy = parseTrustProxy;
const node_net_1 = require("node:net");
// Trust addresses/subnets explicitly; a blanket true or hop count can accept
// spoofed forwarding headers when there are multiple paths to the application.
function parseTrustProxy(value) {
    if (value.trim() === "false")
        return false;
    const entries = value.split(",").map(entry => entry.trim());
    const valid = entries.length > 0 && entries.every(entry => {
        if (["loopback", "linklocal", "uniquelocal"].includes(entry))
            return true;
        const [address, prefix, extra] = entry.split("/");
        const version = (0, node_net_1.isIP)(address);
        return version !== 0 && extra === undefined && (prefix === undefined ||
            (/^\d+$/.test(prefix) && Number(prefix) > 0 && Number(prefix) <= (version === 4 ? 32 : 128)));
    });
    if (!valid)
        throw new Error("TRUST_PROXY must be false or explicit trusted IP addresses/subnets");
    return entries;
}
