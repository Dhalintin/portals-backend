"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = void 0;
// src/features/auth/auth.service.ts
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const password_1 = require("../../lib/password");
const crypto_1 = require("../../lib/crypto");
const AppError_1 = require("../../common/errors/AppError");
const goggle_1 = require("../../lib/goggle");
const resolveAuthContext_1 = require("../../utils/auth/resolveAuthContext");
const issueToken_1 = require("../../utils/issueToken");
const slugify_1 = require("../../utils/slugify");
const toPublic_1 = require("../../utils/toPublic");
async function loadUserWithMemberships(email) {
    return prisma_1.prisma.user.findUnique({
        where: { email },
        include: {
            memberships: {
                where: { isActive: true },
                include: { organization: true },
            },
        },
    });
}
async function loadUserById(id) {
    return prisma_1.prisma.user.findUnique({
        where: { id },
        include: {
            memberships: {
                where: { isActive: true },
                include: { organization: true },
            },
        },
    });
}
async function ensureUniqueSlug(base) {
    let slug = base || "school";
    let n = 0;
    while (true) {
        const candidate = n === 0 ? slug : `${slug}-${n}`;
        const exists = await prisma_1.prisma.organization.findUnique({
            where: { slug: candidate },
        });
        if (!exists)
            return candidate;
        n += 1;
    }
}
exports.authService = {
    // async login(input: LoginBody) {
    //   const user = await loadUserWithMemberships(input.email);
    //   if (!user || !user.isActive) {
    //     throw new UnauthorizedError("Invalid email or password");
    //   }
    //   if (!user.passwordHash) {
    //     throw new UnauthorizedError(
    //       "Account has no password set. Use invite/reset flow."
    //     );
    //   }
    //   const valid = await verifyPassword(input.password, user.passwordHash);
    //   if (!valid) {
    //     throw new UnauthorizedError("Invalid email or password");
    //   }
    //   const ctx = resolveAuthContext(user, input.organizationId);
    //   const { token } = issueToken(user, ctx);
    //   await prisma.user.update({
    //     where: { id: user.id },
    //     data: { lastLoginAt: new Date() },
    //   });
    //   const publicUser = toPublicUser(user, user.memberships, ctx);
    //   return { user: publicUser, token };
    // },
    async login(input) {
        const user = await loadUserWithMemberships(input.email);
        if (!user || !user.isActive) {
            throw new AppError_1.UnauthorizedError("Invalid email or password");
        }
        if (!user.passwordHash) {
            throw new AppError_1.UnauthorizedError("This account uses Google sign-in. Continue with Google, or set a password via reset.");
        }
        const valid = await (0, password_1.verifyPassword)(input.password, user.passwordHash);
        if (!valid) {
            throw new AppError_1.UnauthorizedError("Invalid email or password");
        }
        const ctx = (0, resolveAuthContext_1.resolveAuthContext)(user, input.organizationId);
        const { token } = (0, issueToken_1.issueToken)(user, ctx);
        await prisma_1.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });
        return {
            user: (0, toPublic_1.toPublicUser)(user, user.memberships, ctx),
            token,
        };
    },
    // inside authService object:
    // async register(input: RegisterBody) {
    //   const existing = await prisma.user.findUnique({
    //     where: { email: input.email },
    //   });
    //   if (existing) {
    //     throw new ConflictError("An account with this email already exists");
    //   }
    //   if (input.phone) {
    //     const phoneTaken = await prisma.user.findUnique({
    //       where: { phone: input.phone },
    //     });
    //     if (phoneTaken) {
    //       throw new ConflictError("An account with this phone already exists");
    //     }
    //   }
    //   const baseSlug = input.slug ?? slugify(input.organizationName);
    //   const slug = await ensureUniqueSlug(baseSlug);
    //   const passwordHash = await hashPassword(input.password);
    //   const { user, memberships, ctx } = await prisma.$transaction(async (tx) => {
    //     const user = await tx.user.create({
    //       data: {
    //         email: input.email,
    //         passwordHash,
    //         firstName: input.firstName,
    //         lastName: input.lastName,
    //         phone: input.phone,
    //         globalRole: GlobalRole.USER,
    //         isActive: true,
    //       },
    //     });
    //     const organization = await tx.organization.create({
    //       data: {
    //         name: input.organizationName,
    //         slug,
    //         email: input.email,
    //         phone: input.phone,
    //         createdById: user.id,
    //         onBoarded: false,
    //         isActive: true,
    //       },
    //     });
    //     const membership = await tx.membership.create({
    //       data: {
    //         userId: user.id,
    //         organizationId: organization.id,
    //         role: OrgRole.SCHOOL_ADMIN,
    //         isActive: true,
    //       },
    //       include: { organization: true },
    //     });
    //     const memberships = [membership];
    //     const ctx = {
    //       role: "school_admin" as const,
    //       schoolId: organization.id,
    //       schoolSlug: organization.slug,
    //       schoolName: organization.name,
    //       membershipId: membership.id,
    //     };
    //     return { user, memberships, ctx };
    //   });
    //   await prisma.user.update({
    //     where: { id: user.id },
    //     data: { lastLoginAt: new Date() },
    //   });
    //   const { token } = issueToken(user, ctx);
    //   const publicUser = toPublicUser(user, memberships, ctx);
    //   return { user: publicUser, token };
    // },
    async register(input) {
        const existing = await prisma_1.prisma.user.findUnique({
            where: { email: input.email },
        });
        if (existing) {
            throw new AppError_1.ConflictError("An account with this email already exists");
        }
        if (input.phone) {
            const phoneTaken = await prisma_1.prisma.user.findUnique({
                where: { phone: input.phone },
            });
            if (phoneTaken) {
                throw new AppError_1.ConflictError("An account with this phone already exists");
            }
        }
        const baseSlug = input.slug ?? (0, slugify_1.slugify)(input.organizationName);
        const slug = await ensureUniqueSlug(baseSlug);
        const passwordHash = await (0, password_1.hashPassword)(input.password);
        const { user, memberships, ctx } = await prisma_1.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    email: input.email,
                    passwordHash,
                    firstName: input.firstName,
                    lastName: input.lastName,
                    phone: input.phone,
                    globalRole: client_1.GlobalRole.USER,
                    isActive: true,
                },
            });
            const organization = await tx.organization.create({
                data: {
                    name: input.organizationName,
                    slug,
                    email: input.email,
                    phone: input.phone,
                    createdById: user.id,
                    onBoarded: false,
                    isActive: true,
                },
            });
            const membership = await tx.membership.create({
                data: {
                    userId: user.id,
                    organizationId: organization.id,
                    role: client_1.OrgRole.SCHOOL_ADMIN,
                    isActive: true,
                },
                include: { organization: true },
            });
            const ctx = {
                role: "SCHOOL_ADMIN",
                schoolId: organization.id,
                schoolSlug: organization.slug,
                schoolName: organization.name,
                membershipId: membership.id,
            };
            return { user, memberships: [membership], ctx };
        });
        await prisma_1.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });
        const { token } = (0, issueToken_1.issueToken)(user, ctx);
        return {
            user: (0, toPublic_1.toPublicUser)(user, memberships, ctx),
            token,
        };
    },
    /**
     * Logged-in user creates another school and becomes its SCHOOL_ADMIN.
     * Returns a new token scoped to the new school.
     */
    async createOrganization(userId, input) {
        const user = await loadUserById(userId);
        if (!user || !user.isActive) {
            throw new AppError_1.UnauthorizedError();
        }
        if (user.globalRole === client_1.GlobalRole.SUPER_ADMIN) {
            throw new AppError_1.BadRequestError("Platform admins should create schools via the admin API");
        }
        const baseSlug = input.slug ?? (0, slugify_1.slugify)(input.organizationName);
        const slug = await ensureUniqueSlug(baseSlug);
        const { memberships, ctx } = await prisma_1.prisma.$transaction(async (tx) => {
            const organization = await tx.organization.create({
                data: {
                    name: input.organizationName,
                    slug,
                    email: input.email ?? user.email,
                    phone: input.phone ?? user.phone,
                    createdById: user.id,
                    onBoarded: false,
                    isActive: true,
                },
            });
            await tx.membership.create({
                data: {
                    userId: user.id,
                    organizationId: organization.id,
                    role: client_1.OrgRole.SCHOOL_ADMIN,
                    isActive: true,
                },
            });
            const memberships = await tx.membership.findMany({
                where: { userId: user.id, isActive: true },
                include: { organization: true },
            });
            const membership = memberships.find((m) => m.organizationId === organization.id);
            const ctx = {
                role: "SCHOOL_ADMIN",
                schoolId: organization.id,
                schoolSlug: organization.slug,
                schoolName: organization.name,
                membershipId: membership.id,
            };
            return { memberships, ctx };
        });
        const { token } = (0, issueToken_1.issueToken)(user, ctx);
        return {
            user: (0, toPublic_1.toPublicUser)(user, memberships, ctx),
            token,
        };
    },
    /**
     * Issue a new JWT for another membership the user already has.
     */
    async switchOrganization(userId, input) {
        const user = await loadUserById(userId);
        if (!user || !user.isActive) {
            throw new AppError_1.UnauthorizedError();
        }
        const ctx = (0, resolveAuthContext_1.resolveAuthContext)(user, input.organizationId);
        const { token } = (0, issueToken_1.issueToken)(user, ctx);
        return {
            user: (0, toPublic_1.toPublicUser)(user, user.memberships, ctx),
            token,
        };
    },
    /**
     * Google Sign-In / Sign-Up.
     * - New email → create user (no password) only; client must then createOrganization
     *   OR we require organizationId only when memberships exist.
     * - Existing email → link googleId if missing, then same org resolution as login.
     * - Brand-new Google user with zero memberships → token with role placeholder:
     *   we use schoolId null and role school_admin is wrong. Better: return needsOnboarding.
     */
    async googleAuth(input) {
        let profile;
        try {
            profile = await (0, goggle_1.verifyGoogleIdToken)(input.idToken);
        }
        catch {
            throw new AppError_1.UnauthorizedError("Invalid Google token");
        }
        if (!profile.emailVerified) {
            throw new AppError_1.UnauthorizedError("Google email is not verified");
        }
        let user = (await prisma_1.prisma.user.findFirst({
            where: {
                OR: [{ googleId: profile.googleId }, { email: profile.email }],
            },
            include: {
                memberships: {
                    where: { isActive: true },
                    include: { organization: true },
                },
            },
        })) ?? null;
        if (user && !user.isActive) {
            throw new AppError_1.UnauthorizedError("Account is inactive");
        }
        if (!user) {
            user = await prisma_1.prisma.user.create({
                data: {
                    email: profile.email,
                    googleId: profile.googleId,
                    firstName: profile.firstName,
                    lastName: profile.lastName || "User",
                    avatarUrl: profile.avatarUrl,
                    passwordHash: null,
                    globalRole: client_1.GlobalRole.USER,
                    isActive: true,
                    lastLoginAt: new Date(),
                },
                include: {
                    memberships: {
                        where: { isActive: true },
                        include: { organization: true },
                    },
                },
            });
            // No school yet — client should call createOrganization after storing token
            const onboardingCtx = {
                role: "SCHOOL_ADMIN",
                schoolId: null,
                schoolSlug: null,
                schoolName: null,
                membershipId: null,
            };
            // Token without school: use a dedicated onboard role or allow null schoolId
            const { token } = (0, issueToken_1.issueToken)(user, onboardingCtx);
            return {
                user: (0, toPublic_1.toPublicUser)(user, user.memberships, onboardingCtx),
                token,
                needsOrganization: true,
            };
        }
        // Link Google if user registered with email/password first
        if (!user.googleId) {
            user = await prisma_1.prisma.user.update({
                where: { id: user.id },
                data: {
                    googleId: profile.googleId,
                    avatarUrl: user.avatarUrl ?? profile.avatarUrl,
                    lastLoginAt: new Date(),
                },
                include: {
                    memberships: {
                        where: { isActive: true },
                        include: { organization: true },
                    },
                },
            });
        }
        else if (user.googleId !== profile.googleId) {
            throw new AppError_1.ConflictError("This email is linked to a different Google account");
        }
        else {
            await prisma_1.prisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() },
            });
        }
        // Platform admin
        if (user.globalRole === client_1.GlobalRole.SUPER_ADMIN) {
            const ctx = (0, resolveAuthContext_1.resolveAuthContext)(user, input.organizationId);
            const { token } = (0, issueToken_1.issueToken)(user, ctx);
            return {
                user: (0, toPublic_1.toPublicUser)(user, user.memberships, ctx),
                token,
                needsOrganization: false,
            };
        }
        const activeMemberships = user.memberships.filter((m) => m.isActive && m.organization.isActive);
        if (activeMemberships.length === 0) {
            const onboardingCtx = {
                role: "SCHOOL_ADMIN",
                schoolId: null,
                schoolSlug: null,
                schoolName: null,
                membershipId: null,
            };
            const { token } = (0, issueToken_1.issueToken)(user, onboardingCtx);
            return {
                user: (0, toPublic_1.toPublicUser)(user, user.memberships, onboardingCtx),
                token,
                needsOrganization: true,
            };
        }
        const ctx = (0, resolveAuthContext_1.resolveAuthContext)(user, input.organizationId);
        const { token } = (0, issueToken_1.issueToken)(user, ctx);
        return {
            user: (0, toPublic_1.toPublicUser)(user, user.memberships, ctx),
            token,
            needsOrganization: false,
        };
    },
    async me(userId, tokenCtx) {
        const user = await loadUserById(userId);
        if (!user || !user.isActive) {
            throw new AppError_1.UnauthorizedError("User not found or inactive");
        }
        // Re-validate membership still active when school-scoped
        if (tokenCtx.schoolId) {
            const membership = user.memberships.find((m) => m.organizationId === tokenCtx.schoolId &&
                m.isActive &&
                m.organization.isActive);
            if (!membership && user.globalRole !== client_1.GlobalRole.SUPER_ADMIN) {
                throw new AppError_1.ForbiddenError("School membership no longer active");
            }
        }
        const ctx = {
            role: tokenCtx.role,
            schoolId: tokenCtx.schoolId,
            schoolSlug: user.memberships.find((m) => m.organizationId === tokenCtx.schoolId)
                ?.organization.slug ?? null,
            schoolName: user.memberships.find((m) => m.organizationId === tokenCtx.schoolId)
                ?.organization.name ?? null,
            membershipId: tokenCtx.membershipId ?? null,
        };
        if (tokenCtx.role === "PLATFORM_ADMIN") {
            ctx.schoolSlug = null;
            ctx.schoolName = null;
        }
        return (0, toPublic_1.toPublicUser)(user, user.memberships, ctx);
    },
    /**
     * Stateless JWT: client discards token.
     * Hook for future refresh-token revoke / audit.
     */
    async logout(_userId) {
        return { ok: true };
    },
    async forgotPassword(input) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { email: input.email },
        });
        // Always same response (no email enumeration)
        const generic = {
            message: "If that email exists, a reset link has been sent.",
        };
        if (!user || !user.isActive) {
            return generic;
        }
        const rawToken = (0, crypto_1.randomToken)(32);
        const tokenHash = (0, crypto_1.sha256)(rawToken);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
        await prisma_1.prisma.passwordResetToken.create({
            data: {
                userId: user.id,
                tokenHash,
                expiresAt,
            },
        });
        // TODO: send email with link `${FRONTEND_URL}/reset-password?token=${rawToken}`
        // Dev only — remove or gate behind env flag:
        if (process.env.NODE_ENV !== "production") {
            return { ...generic, devResetToken: rawToken };
        }
        return generic;
    },
    async resetPassword(input) {
        const tokenHash = (0, crypto_1.sha256)(input.token);
        const record = await prisma_1.prisma.passwordResetToken.findUnique({
            where: { tokenHash },
            include: { user: true },
        });
        if (!record || record.usedAt || record.expiresAt < new Date()) {
            throw new AppError_1.BadRequestError("Invalid or expired reset token");
        }
        if (!record.user.isActive) {
            throw new AppError_1.BadRequestError("Account is inactive");
        }
        const passwordHash = await (0, password_1.hashPassword)(input.password);
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.user.update({
                where: { id: record.userId },
                data: { passwordHash },
            }),
            prisma_1.prisma.passwordResetToken.update({
                where: { id: record.id },
                data: { usedAt: new Date() },
            }),
            // invalidate other outstanding tokens
            prisma_1.prisma.passwordResetToken.updateMany({
                where: {
                    userId: record.userId,
                    usedAt: null,
                    id: { not: record.id },
                },
                data: { usedAt: new Date() },
            }),
        ]);
        return { message: "Password updated successfully" };
    },
    async changePassword(userId, input) {
        const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.isActive) {
            throw new AppError_1.UnauthorizedError();
        }
        if (!user.passwordHash) {
            throw new AppError_1.BadRequestError("No password set on this account");
        }
        const ok = await (0, password_1.verifyPassword)(input.currentPassword, user.passwordHash);
        if (!ok) {
            throw new AppError_1.UnauthorizedError("Current password is incorrect");
        }
        if (input.currentPassword === input.newPassword) {
            throw new AppError_1.BadRequestError("New password must be different");
        }
        const passwordHash = await (0, password_1.hashPassword)(input.newPassword);
        await prisma_1.prisma.user.update({
            where: { id: userId },
            data: { passwordHash },
        });
        return { message: "Password changed successfully" };
    },
};
