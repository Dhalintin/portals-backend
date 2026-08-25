"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueToken = issueToken;
const jwt_1 = require("../lib/jwt");
function issueToken(user, ctx) {
    const payload = {
        sub: user.id,
        email: user.email,
        role: ctx.role,
        schoolId: ctx.schoolId,
        membershipId: ctx.membershipId,
    };
    return { token: (0, jwt_1.signAccessToken)(payload), payload };
}
