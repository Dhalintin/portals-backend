"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const permissions_1 = require("../../auth/permissions");
const memberships_validation_1 = require("./memberships.validation");
const memberships_controller_1 = require("./memberships.controller");
const authenticate_1 = require("../../middlewares/authenticate");
const requireSchool_1 = require("../../middlewares/requireSchool");
const requirePermission_1 = require("../../middlewares/requirePermission");
const validate_1 = require("../../middlewares/validate");
const rateLimit_1 = require("../../middlewares/rateLimit");
const invitations_service_1 = require("../auth/invitations.service");
const http_1 = require("../../lib/http");
const zod_1 = require("zod");
const c = new memberships_controller_1.MembershipsController();
const membershipRoutes = (0, express_1.Router)();
membershipRoutes.use(authenticate_1.authenticate, requireSchool_1.requireSchool);
membershipRoutes.get("/invitations", (0, requirePermission_1.requirePermission)("memberships:write"), async (req, res, next) => {
    try {
        const { prisma } = await Promise.resolve().then(() => __importStar(require("../../lib/prisma")));
        (0, http_1.sendSuccess)(res, await prisma.schoolInvitation.findMany({ where: { organizationId: req.auth.schoolId }, take: 100,
            orderBy: { createdAt: "desc" }, select: { id: true, email: true, role: true, parentId: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true } }));
    }
    catch (error) {
        next(error);
    }
});
membershipRoutes.post("/invitations/:id/revoke", (0, requirePermission_1.requirePermission)("memberships:write"), (0, validate_1.validate)(zod_1.z.object({ id: zod_1.z.string().uuid() }), "params"), async (req, res, next) => {
    try {
        (0, http_1.sendSuccess)(res, await invitations_service_1.invitationsService.revoke(req.auth.schoolId, req.params.id, req.auth.userId));
    }
    catch (error) {
        next(error);
    }
});
membershipRoutes.get("/", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["memberships:read"]), (0, validate_1.validate)(memberships_validation_1.listMembershipsQuerySchema, "query"), c.list);
membershipRoutes.post("/", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["memberships:write"]), (0, validate_1.validate)(memberships_validation_1.createMembershipSchema), rateLimit_1.invitationLimiter, c.create);
membershipRoutes.patch("/:membershipId", (0, requirePermission_1.requirePermission)(permissions_1.PERMISSIONS["memberships:write"]), (0, validate_1.validate)(memberships_validation_1.membershipIdParamsSchema, "params"), (0, validate_1.validate)(memberships_validation_1.updateMembershipSchema), c.update);
exports.default = membershipRoutes;
