"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.AuthService = void 0;
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../lib/errors");
const password_1 = require("../../lib/password");
const token_1 = require("../../lib/token");
const auth_sessions_1 = require("./auth.sessions");
const userTransaction_1 = require("../../lib/userTransaction");
const rbac_1 = require("../../auth/rbac");
const audit_service_1 = require("../audit/audit.service");
const authEmail_1 = require("../../lib/authEmail");
const userPublicSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    phone: true,
    avatarUrl: true,
    globalRole: true,
    isActive: true,
};
class AuthService {
    async registerSchoolAdmin(input) {
        const existing = await prisma_1.prisma.user.findUnique({
            where: { email: input.email },
            select: { id: true },
        });
        if (existing) {
            throw new errors_1.AppError(409, "EMAIL_IN_USE", "An account with this email already exists");
        }
        const slugTaken = await prisma_1.prisma.organization.findUnique({
            where: { slug: input.schoolSlug },
            select: { id: true },
        });
        if (slugTaken) {
            throw new errors_1.AppError(409, "SLUG_IN_USE", "This school URL is already taken");
        }
        const passwordHash = await (0, password_1.hashPassword)(input.password);
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    email: input.email,
                    passwordHash,
                    firstName: input.firstName,
                    lastName: input.lastName,
                    phone: input.phone,
                    globalRole: "USER",
                },
            });
            const org = await tx.organization.create({
                data: {
                    name: input.schoolName,
                    slug: input.schoolSlug,
                    createdById: user.id,
                    site: { create: {} },
                    subscription: {
                        create: {
                            plan: "FREE",
                            status: "ACTIVE",
                            studentCap: 100,
                            sponsorship: "SCHOOL",
                        },
                    },
                },
            });
            const membership = await tx.membership.create({
                data: {
                    userId: user.id,
                    organizationId: org.id,
                    role: "PROPRIETOR",
                },
            });
            return { user, org, membership };
        });
        return this.issueTokens(result.user, result.membership);
    }
    async login(input, meta) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { email: input.email },
        });
        if (!user || !user.isActive) {
            throw new errors_1.AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
        }
        const valid = await (0, password_1.verifyPassword)(input.password, user.passwordHash);
        if (!valid) {
            throw new errors_1.AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
        }
        // Platform staff: apex login (no schoolSlug)
        if (!input.schoolSlug) {
            if (user.globalRole !== "SUPER_ADMIN" &&
                user.globalRole !== "PLATFORM_ADMIN") {
                throw new errors_1.AppError(403, "SCHOOL_LOGIN_REQUIRED", "Sign in from your school workspace");
            }
            await prisma_1.prisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() },
            });
            await audit_service_1.auditService.write({
                action: "LOGIN",
                actorId: user.id,
                metadata: { surface: "platform" },
                requestId: meta?.requestId,
            });
            return this.issueTokens(user, null);
        }
        const org = await prisma_1.prisma.organization.findFirst({
            where: { slug: input.schoolSlug, isActive: true },
            select: { id: true, name: true, slug: true },
        });
        if (!org) {
            throw new errors_1.AppError(404, "SCHOOL_NOT_FOUND", "School not found");
        }
        const membership = await prisma_1.prisma.membership.findFirst({
            where: {
                userId: user.id,
                organizationId: org.id,
                isActive: true,
            },
        });
        if (!membership) {
            throw new errors_1.AppError(403, "NOT_A_MEMBER", "You are not a member of this school");
        }
        await prisma_1.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });
        await audit_service_1.auditService.write({
            action: "LOGIN",
            actorId: user.id,
            organizationId: org.id,
            metadata: { surface: "school", role: membership.role },
            requestId: meta?.requestId,
        });
        return this.issueTokens(user, membership);
    }
    async refresh(refreshToken) {
        return auth_sessions_1.authSessions.refresh(refreshToken);
    }
    async logout(userId, sessionId) {
        return auth_sessions_1.authSessions.logout(userId, sessionId);
    }
    async logoutAll(userId) {
        return auth_sessions_1.authSessions.logoutAll(userId);
    }
    async me(userId, schoolId) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: userPublicSelect,
        });
        if (!user)
            throw new errors_1.AppError(404, "NOT_FOUND", "User not found");
        let membership = null;
        if (schoolId) {
            membership = await prisma_1.prisma.membership.findFirst({
                where: { userId, organizationId: schoolId, isActive: true },
                select: {
                    role: true,
                    organization: { select: { id: true, name: true, slug: true } },
                },
            });
        }
        return {
            user,
            school: membership?.organization ?? null,
            orgRole: membership?.role ?? null,
            permissions: membership ? (0, rbac_1.permissionsForOrgRole)(membership.role) : [],
        };
    }
    async forgotPassword(email) {
        // Validate configuration before looking up either known or unknown emails.
        (0, authEmail_1.authLink)("/reset-password", "configuration-check");
        (0, authEmail_1.encryptAuthEmail)("");
        // Always same response — no account enumeration
        const user = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive) {
            return { ok: true };
        }
        const token = (0, token_1.randomToken)(32);
        const tokenHash = (0, token_1.sha256)(token);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        const created = await (0, userTransaction_1.userTransaction)(user.id, async (tx) => {
            const current = await tx.user.findUnique({ where: { id: user.id } });
            if (!current?.isActive || current.authVersion !== user.authVersion)
                return false;
            await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });
            await (0, authEmail_1.enqueueAuthEmail)(tx, user.email, "Reset your SchoolOS password", `Reset your password within one hour: ${(0, authEmail_1.authLink)("/reset-password", token)}\nIf you did not request this, ignore this email.`, expiresAt);
            return true;
        });
        if (!created)
            return { ok: true };
        return { ok: true };
    }
    async resetPassword(token, password) {
        const tokenHash = (0, token_1.sha256)(token);
        const row = await prisma_1.prisma.passwordResetToken.findFirst({
            where: {
                tokenHash,
                usedAt: null,
                expiresAt: { gt: new Date() },
            },
        });
        if (!row) {
            throw new errors_1.AppError(400, "INVALID_TOKEN", "Reset link is invalid or expired");
        }
        const passwordHash = await (0, password_1.hashPassword)(password);
        await (0, userTransaction_1.userTransaction)(row.userId, async (tx) => {
            const now = new Date();
            const consumed = await tx.passwordResetToken.updateMany({
                where: { id: row.id, userId: row.userId, tokenHash, usedAt: null, expiresAt: { gt: now }, user: { isActive: true } },
                data: { usedAt: now },
            });
            if (consumed.count !== 1) {
                throw new errors_1.AppError(400, "INVALID_TOKEN", "Reset link is invalid or expired");
            }
            await tx.user.update({
                where: { id: row.userId }, data: { passwordHash, authVersion: { increment: 1 } },
            });
            await tx.passwordResetToken.updateMany({
                where: { userId: row.userId, usedAt: null }, data: { usedAt: now },
            });
            await tx.authSession.updateMany({
                where: { userId: row.userId, revokedAt: null }, data: { revokedAt: now },
            });
        });
        return { ok: true };
    }
    issueTokens(user, membership) {
        // Reload identity/membership inside the session transaction. School/role
        // values read before password verification must not create stale sessions.
        return auth_sessions_1.authSessions.create(user.id, membership?.organizationId ?? null, user.authVersion);
    }
}
exports.AuthService = AuthService;
exports.authService = new AuthService();
// // src/features/auth/auth.service.ts
// import {
//   GlobalRole,
//   OrgRole,
//   type Membership,
//   type Organization,
// } from "@prisma/client";
// import { prisma } from "../../lib/prisma";
// import { hashPassword, verifyPassword } from "../../lib/password";
// import { randomToken, sha256 } from "../../lib/crypto";
// import {
//   BadRequestError,
//   ConflictError,
//   ForbiddenError,
//   UnauthorizedError,
// } from "../../common/errors/AppError";
// import type { AuthTokenPayload } from "./auth.types";
// import type {
//   ChangePasswordBody,
//   CreateOrganizationBody,
//   ForgotPasswordBody,
//   GoogleAuthBody,
//   LoginBody,
//   RegisterBody,
//   ResetPasswordBody,
//   SwitchOrganizationBody,
// } from "./auth.dto";
// import { verifyGoogleIdToken } from "../../lib/goggle";
// import {
//   resolvePlatformContext,
//   resolveSchoolContext,
// } from "../../utils/auth/resolveAuthContext";
// import { issueToken } from "../../utils/issueToken";
// import { slugify } from "../../utils/slugify";
// import { toPublicUser } from "../../utils/toPublic";
// export type MembershipWithOrg = Membership & { organization: Organization };
// async function loadUserWithMemberships(email: string) {
//   return prisma.user.findUnique({
//     where: { email },
//     include: {
//       memberships: {
//         where: { isActive: true },
//         include: { organization: true },
//       },
//     },
//   });
// }
// async function loadUserById(id: string) {
//   return prisma.user.findUnique({
//     where: { id },
//     include: {
//       memberships: {
//         where: { isActive: true },
//         include: { organization: true },
//       },
//     },
//   });
// }
// async function ensureUniqueSlug(base: string): Promise<string> {
//   let slug = base || "school";
//   let n = 0;
//   while (true) {
//     const candidate = n === 0 ? slug : `${slug}-${n}`;
//     const exists = await prisma.organization.findUnique({
//       where: { slug: candidate },
//     });
//     if (!exists) return candidate;
//     n += 1;
//   }
// }
// /**
//  * After password/Google is valid, enforce surface rules:
//  * - platform → globalRole SUPER_ADMIN | PLATFORM_ADMIN
//  * - school   → active Membership in target org (id or slug)
//  */
// function resolveLoginContext(
//   user: NonNullable<Awaited<ReturnType<typeof loadUserWithMemberships>>>,
//   input: {
//     surface: "platform" | "school";
//     organizationId?: string;
//     organizationSlug?: string;
//   }
// ) {
//   if (input.surface === "platform") {
//     // localhost:3000/login — platform staff only
//     return resolvePlatformContext(user);
//   }
//   // grace-international.localhost:3000/login — that school only
//   return resolveSchoolContext(user, {
//     organizationId: input.organizationId,
//     organizationSlug: input.organizationSlug,
//   });
// }
// export const authService = {
//   async login(input: LoginBody) {
//     const user = await loadUserWithMemberships(input.email);
//     if (!user || !user.isActive) {
//       throw new UnauthorizedError("Invalid email or password");
//     }
//     if (!user.passwordHash) {
//       throw new UnauthorizedError(
//         "This account uses Google sign-in. Continue with Google, or set a password via reset."
//       );
//     }
//     const valid = await verifyPassword(input.password, user.passwordHash);
//     if (!valid) {
//       throw new UnauthorizedError("Invalid email or password");
//     }
//     const ctx = resolveLoginContext(user, {
//       surface: input.surface,
//       organizationId: input.organizationId,
//       organizationSlug: input.organizationSlug,
//     });
//     const { token } = issueToken(user, ctx);
//     await prisma.user.update({
//       where: { id: user.id },
//       data: { lastLoginAt: new Date() },
//     });
//     return {
//       user: toPublicUser(user, user.memberships, ctx),
//       token,
//     };
//   },
//   async register(input: RegisterBody) {
//     const existing = await prisma.user.findUnique({
//       where: { email: input.email },
//     });
//     if (existing) {
//       throw new ConflictError("An account with this email already exists");
//     }
//     if (input.phone) {
//       const phoneTaken = await prisma.user.findUnique({
//         where: { phone: input.phone },
//       });
//       if (phoneTaken) {
//         throw new ConflictError("An account with this phone already exists");
//       }
//     }
//     const baseSlug = input.slug ?? slugify(input.organizationName);
//     const slug = await ensureUniqueSlug(baseSlug);
//     const passwordHash = await hashPassword(input.password);
//     const { user, memberships, ctx } = await prisma.$transaction(async (tx) => {
//       const user = await tx.user.create({
//         data: {
//           email: input.email,
//           passwordHash,
//           firstName: input.firstName,
//           lastName: input.lastName,
//           phone: input.phone,
//           globalRole: GlobalRole.USER,
//           isActive: true,
//         },
//       });
//       const organization = await tx.organization.create({
//         data: {
//           name: input.organizationName,
//           slug,
//           email: input.email,
//           phone: input.phone,
//           createdById: user.id,
//           onBoarded: false,
//           isActive: true,
//         },
//       });
//       const membership = await tx.membership.create({
//         data: {
//           userId: user.id,
//           organizationId: organization.id,
//           role: OrgRole.SCHOOL_ADMIN,
//           isActive: true,
//         },
//         include: { organization: true },
//       });
//       const ctx = {
//         role: "SCHOOL_ADMIN" as const,
//         schoolId: organization.id,
//         schoolSlug: organization.slug,
//         schoolName: organization.name,
//         membershipId: membership.id,
//       };
//       return { user, memberships: [membership], ctx };
//     });
//     await prisma.user.update({
//       where: { id: user.id },
//       data: { lastLoginAt: new Date() },
//     });
//     const { token } = issueToken(user, ctx);
//     return {
//       user: toPublicUser(user, memberships, ctx),
//       token,
//     };
//   },
//   async createOrganization(userId: string, input: CreateOrganizationBody) {
//     const user = await loadUserById(userId);
//     if (!user || !user.isActive) {
//       throw new UnauthorizedError();
//     }
//     if (
//       user.globalRole === GlobalRole.SUPER_ADMIN ||
//       user.globalRole === GlobalRole.PLATFORM_ADMIN
//     ) {
//       throw new BadRequestError(
//         "Platform staff should create schools via the admin API"
//       );
//     }
//     const baseSlug = input.slug ?? slugify(input.organizationName);
//     const slug = await ensureUniqueSlug(baseSlug);
//     const { memberships, ctx } = await prisma.$transaction(async (tx) => {
//       const organization = await tx.organization.create({
//         data: {
//           name: input.organizationName,
//           slug,
//           email: input.email ?? user.email,
//           phone: input.phone ?? user.phone,
//           createdById: user.id,
//           onBoarded: false,
//           isActive: true,
//         },
//       });
//       await tx.membership.create({
//         data: {
//           userId: user.id,
//           organizationId: organization.id,
//           role: OrgRole.SCHOOL_ADMIN,
//           isActive: true,
//         },
//       });
//       const memberships = await tx.membership.findMany({
//         where: { userId: user.id, isActive: true },
//         include: { organization: true },
//       });
//       const membership = memberships.find(
//         (m) => m.organizationId === organization.id
//       )!;
//       const ctx = {
//         role: "SCHOOL_ADMIN" as const,
//         schoolId: organization.id,
//         schoolSlug: organization.slug,
//         schoolName: organization.name,
//         membershipId: membership.id,
//       };
//       return { memberships, ctx };
//     });
//     const { token } = issueToken(user, ctx);
//     return {
//       user: toPublicUser(user, memberships, ctx),
//       token,
//     };
//   },
//   /**
//    * Switch JWT to another school the user is already a member of.
//    */
//   async switchOrganization(userId: string, input: SwitchOrganizationBody) {
//     const user = await loadUserById(userId);
//     if (!user || !user.isActive) {
//       throw new UnauthorizedError();
//     }
//     // Must be a member of the target school — not “any school on the platform”
//     const ctx = resolveSchoolContext(user, {
//       organizationId: input.organizationId,
//     });
//     const { token } = issueToken(user, ctx);
//     return {
//       user: toPublicUser(user, user.memberships, ctx),
//       token,
//     };
//   },
//   async googleAuth(input: GoogleAuthBody) {
//     let profile;
//     try {
//       profile = await verifyGoogleIdToken(input.idToken);
//     } catch {
//       throw new UnauthorizedError("Invalid Google token");
//     }
//     if (!profile.emailVerified) {
//       throw new UnauthorizedError("Google email is not verified");
//     }
//     let user =
//       (await prisma.user.findFirst({
//         where: {
//           OR: [{ googleId: profile.googleId }, { email: profile.email }],
//         },
//         include: {
//           memberships: {
//             where: { isActive: true },
//             include: { organization: true },
//           },
//         },
//       })) ?? null;
//     if (user && !user.isActive) {
//       throw new UnauthorizedError("Account is inactive");
//     }
//     if (!user) {
//       // New Google user: cannot use platform URL; cannot use school URL without membership
//       if (input.surface === "platform") {
//         throw new ForbiddenError(
//           "No platform staff account exists for this Google user"
//         );
//       }
//       throw new ForbiddenError(
//         "You are not a staff member of this school. Ask your school admin to invite you."
//       );
//     }
//     if (!user.googleId) {
//       user = await prisma.user.update({
//         where: { id: user.id },
//         data: {
//           googleId: profile.googleId,
//           avatarUrl: user.avatarUrl ?? profile.avatarUrl,
//           lastLoginAt: new Date(),
//         },
//         include: {
//           memberships: {
//             where: { isActive: true },
//             include: { organization: true },
//           },
//         },
//       });
//     } else if (user.googleId !== profile.googleId) {
//       throw new ConflictError(
//         "This email is linked to a different Google account"
//       );
//     } else {
//       await prisma.user.update({
//         where: { id: user.id },
//         data: { lastLoginAt: new Date() },
//       });
//       user = (await loadUserById(user.id))!;
//     }
//     const ctx = resolveLoginContext(user, {
//       surface: input.surface,
//       organizationId: input.organizationId,
//       organizationSlug: input.organizationSlug,
//     });
//     const { token } = issueToken(user, ctx);
//     return {
//       user: toPublicUser(user, user.memberships, ctx),
//       token,
//       needsOrganization: false as const,
//     };
//   },
//   async me(userId: string, tokenCtx: AuthTokenPayload) {
//     const user = await loadUserById(userId);
//     if (!user || !user.isActive) {
//       throw new UnauthorizedError("User not found or inactive");
//     }
//     if (tokenCtx.role === "SUPER_ADMIN" || tokenCtx.role === "PLATFORM_ADMIN") {
//       if (
//         user.globalRole !== GlobalRole.SUPER_ADMIN &&
//         user.globalRole !== GlobalRole.PLATFORM_ADMIN
//       ) {
//         throw new ForbiddenError("Platform role revoked");
//       }
//       return toPublicUser(user, user.memberships, resolvePlatformContext(user));
//     }
//     if (!tokenCtx.schoolId) {
//       throw new ForbiddenError("Invalid school session");
//     }
//     const membership = user.memberships.find(
//       (m) =>
//         m.organizationId === tokenCtx.schoolId &&
//         m.isActive &&
//         m.organization.isActive
//     );
//     if (!membership) {
//       throw new ForbiddenError("You are no longer a member of this school");
//     }
//     return toPublicUser(user, user.memberships, {
//       role: tokenCtx.role,
//       schoolId: tokenCtx.schoolId,
//       schoolSlug: membership.organization.slug,
//       schoolName: membership.organization.name,
//       membershipId: membership.id,
//     });
//   },
//   async logout(_userId: string) {
//     return { ok: true as const };
//   },
//   async forgotPassword(input: ForgotPasswordBody) {
//     const user = await prisma.user.findUnique({
//       where: { email: input.email },
//     });
//     const generic = {
//       message: "If that email exists, a reset link has been sent.",
//     };
//     if (!user || !user.isActive) {
//       return generic;
//     }
//     const rawToken = randomToken(32);
//     const tokenHash = sha256(rawToken);
//     const expiresAt = new Date(Date.now() + 1000 * 60 * 60);
//     await prisma.passwordResetToken.create({
//       data: {
//         userId: user.id,
//         tokenHash,
//         expiresAt,
//       },
//     });
//     if (process.env.NODE_ENV !== "production") {
//       return { ...generic, devResetToken: rawToken };
//     }
//     return generic;
//   },
//   async resetPassword(input: ResetPasswordBody) {
//     const tokenHash = sha256(input.token);
//     const record = await prisma.passwordResetToken.findUnique({
//       where: { tokenHash },
//       include: { user: true },
//     });
//     if (!record || record.usedAt || record.expiresAt < new Date()) {
//       throw new BadRequestError("Invalid or expired reset token");
//     }
//     if (!record.user.isActive) {
//       throw new BadRequestError("Account is inactive");
//     }
//     const passwordHash = await hashPassword(input.password);
//     await prisma.$transaction([
//       prisma.user.update({
//         where: { id: record.userId },
//         data: { passwordHash },
//       }),
//       prisma.passwordResetToken.update({
//         where: { id: record.id },
//         data: { usedAt: new Date() },
//       }),
//       prisma.passwordResetToken.updateMany({
//         where: {
//           userId: record.userId,
//           usedAt: null,
//           id: { not: record.id },
//         },
//         data: { usedAt: new Date() },
//       }),
//     ]);
//     return { message: "Password updated successfully" };
//   },
//   async changePassword(userId: string, input: ChangePasswordBody) {
//     const user = await prisma.user.findUnique({ where: { id: userId } });
//     if (!user || !user.isActive) {
//       throw new UnauthorizedError();
//     }
//     if (!user.passwordHash) {
//       throw new BadRequestError("No password set on this account");
//     }
//     const ok = await verifyPassword(input.currentPassword, user.passwordHash);
//     if (!ok) {
//       throw new UnauthorizedError("Current password is incorrect");
//     }
//     if (input.currentPassword === input.newPassword) {
//       throw new BadRequestError("New password must be different");
//     }
//     const passwordHash = await hashPassword(input.newPassword);
//     await prisma.user.update({
//       where: { id: userId },
//       data: { passwordHash },
//     });
//     return { message: "Password changed successfully" };
//   },
// };
