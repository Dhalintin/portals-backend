// src/features/auth/auth.service.ts
import {
  GlobalRole,
  OrgRole,
  type Membership,
  type Organization,
  type User,
} from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { hashPassword, verifyPassword } from "../../lib/password";
import { signAccessToken } from "../../lib/jwt";
import { randomToken, sha256 } from "../../lib/crypto";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from "../../common/errors/AppError";
import type { AppRole, AuthTokenPayload, PublicUser } from "./auth.types";
import type {
  ChangePasswordBody,
  CreateOrganizationBody,
  ForgotPasswordBody,
  GoogleAuthBody,
  LoginBody,
  RegisterBody,
  ResetPasswordBody,
  SwitchOrganizationBody,
} from "./auth.dto";
import { verifyGoogleIdToken } from "../../lib/goggle";

type MembershipWithOrg = Membership & { organization: Organization };

function mapOrgRole(role: OrgRole): AppRole {
  switch (role) {
    case OrgRole.SCHOOL_ADMIN:
      return "school_admin";
    case OrgRole.TEACHER:
      return "teacher";
    case OrgRole.EXAM_OFFICER:
      return "exam_officer";
    default:
      return "teacher";
  }
}

function displayName(user: User): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

function toPublicUser(
  user: User,
  memberships: MembershipWithOrg[],
  active: {
    role: AppRole;
    schoolId: string | null;
    schoolSlug: string | null;
    schoolName: string | null;
  }
): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: displayName(user),
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: active.role,
    schoolId: active.schoolId,
    schoolSlug: active.schoolSlug,
    schoolName: active.schoolName,
    globalRole: user.globalRole,
    memberships: memberships.map((m) => ({
      id: m.id,
      organizationId: m.organizationId,
      role: mapOrgRole(m.role),
      schoolName: m.organization.name,
      schoolSlug: m.organization.slug,
      isActive: m.isActive && m.organization.isActive,
    })),
  };
}

async function loadUserWithMemberships(email: string) {
  return prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        where: { isActive: true },
        include: { organization: true },
      },
    },
  });
}

async function loadUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      memberships: {
        where: { isActive: true },
        include: { organization: true },
      },
    },
  });
}

function resolveAuthContext(
  user: User & { memberships: MembershipWithOrg[] },
  organizationId?: string
): {
  role: AppRole;
  schoolId: string | null;
  schoolSlug: string | null;
  schoolName: string | null;
  membershipId: string | null;
} {
  if (user.globalRole === GlobalRole.SUPER_ADMIN) {
    return {
      role: "platform_admin",
      schoolId: null,
      schoolSlug: null,
      schoolName: null,
      membershipId: null,
    };
  }

  const activeMemberships = user.memberships.filter(
    (m) => m.isActive && m.organization.isActive
  );

  if (activeMemberships.length === 0) {
    throw new ForbiddenError("No active school membership");
  }

  let membership: MembershipWithOrg | undefined;

  if (organizationId) {
    membership = activeMemberships.find(
      (m) => m.organizationId === organizationId
    );
    if (!membership) {
      throw new ForbiddenError("Not a member of that organization");
    }
  } else if (activeMemberships.length === 1) {
    membership = activeMemberships[0];
  } else {
    throw new BadRequestError(
      "Multiple schools found. Pass organizationId to select one.",
      {
        code: "ORGANIZATION_SELECTION_REQUIRED",
        memberships: activeMemberships.map((m) => ({
          organizationId: m.organizationId,
          schoolName: m.organization.name,
          schoolSlug: m.organization.slug,
          role: mapOrgRole(m.role),
        })),
      }
    );
  }

  return {
    role: mapOrgRole(membership.role),
    schoolId: membership.organizationId,
    schoolSlug: membership.organization.slug,
    schoolName: membership.organization.name,
    membershipId: membership.id,
  };
}

function issueToken(
  user: User,
  ctx: ReturnType<typeof resolveAuthContext>
): { token: string; payload: AuthTokenPayload } {
  const payload: AuthTokenPayload = {
    sub: user.id,
    email: user.email,
    role: ctx.role,
    schoolId: ctx.schoolId,
    membershipId: ctx.membershipId,
  };
  return { token: signAccessToken(payload), payload };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function ensureUniqueSlug(base: string): Promise<string> {
  let slug = base || "school";
  let n = 0;
  while (true) {
    const candidate = n === 0 ? slug : `${slug}-${n}`;
    const exists = await prisma.organization.findUnique({
      where: { slug: candidate },
    });
    if (!exists) return candidate;
    n += 1;
  }
}

export const authService = {
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
  async login(input: LoginBody) {
    const user = await loadUserWithMemberships(input.email);

    if (!user || !user.isActive) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (!user.passwordHash) {
      throw new UnauthorizedError(
        "This account uses Google sign-in. Continue with Google, or set a password via reset."
      );
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const ctx = resolveAuthContext(user, input.organizationId);
    const { token } = issueToken(user, ctx);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: toPublicUser(user, user.memberships, ctx),
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
  async register(input: RegisterBody) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new ConflictError("An account with this email already exists");
    }

    if (input.phone) {
      const phoneTaken = await prisma.user.findUnique({
        where: { phone: input.phone },
      });
      if (phoneTaken) {
        throw new ConflictError("An account with this phone already exists");
      }
    }

    const baseSlug = input.slug ?? slugify(input.organizationName);
    const slug = await ensureUniqueSlug(baseSlug);
    const passwordHash = await hashPassword(input.password);

    const { user, memberships, ctx } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          globalRole: GlobalRole.USER,
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
          role: OrgRole.SCHOOL_ADMIN,
          isActive: true,
        },
        include: { organization: true },
      });

      const ctx = {
        role: "school_admin" as const,
        schoolId: organization.id,
        schoolSlug: organization.slug,
        schoolName: organization.name,
        membershipId: membership.id,
      };

      return { user, memberships: [membership], ctx };
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { token } = issueToken(user, ctx);
    return {
      user: toPublicUser(user, memberships, ctx),
      token,
    };
  },

  /**
   * Logged-in user creates another school and becomes its SCHOOL_ADMIN.
   * Returns a new token scoped to the new school.
   */
  async createOrganization(userId: string, input: CreateOrganizationBody) {
    const user = await loadUserById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError();
    }
    if (user.globalRole === GlobalRole.SUPER_ADMIN) {
      throw new BadRequestError(
        "Platform admins should create schools via the admin API"
      );
    }

    const baseSlug = input.slug ?? slugify(input.organizationName);
    const slug = await ensureUniqueSlug(baseSlug);

    const { memberships, ctx } = await prisma.$transaction(async (tx) => {
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
          role: OrgRole.SCHOOL_ADMIN,
          isActive: true,
        },
      });

      const memberships = await tx.membership.findMany({
        where: { userId: user.id, isActive: true },
        include: { organization: true },
      });

      const membership = memberships.find(
        (m) => m.organizationId === organization.id
      )!;

      const ctx = {
        role: "school_admin" as const,
        schoolId: organization.id,
        schoolSlug: organization.slug,
        schoolName: organization.name,
        membershipId: membership.id,
      };

      return { memberships, ctx };
    });

    const { token } = issueToken(user, ctx);
    return {
      user: toPublicUser(user, memberships, ctx),
      token,
    };
  },

  /**
   * Issue a new JWT for another membership the user already has.
   */
  async switchOrganization(userId: string, input: SwitchOrganizationBody) {
    const user = await loadUserById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError();
    }

    const ctx = resolveAuthContext(user, input.organizationId);
    const { token } = issueToken(user, ctx);

    return {
      user: toPublicUser(user, user.memberships, ctx),
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
  async googleAuth(input: GoogleAuthBody) {
    let profile;
    try {
      profile = await verifyGoogleIdToken(input.idToken);
    } catch {
      throw new UnauthorizedError("Invalid Google token");
    }

    if (!profile.emailVerified) {
      throw new UnauthorizedError("Google email is not verified");
    }

    let user =
      (await prisma.user.findFirst({
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
      throw new UnauthorizedError("Account is inactive");
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: profile.email,
          googleId: profile.googleId,
          firstName: profile.firstName,
          lastName: profile.lastName || "User",
          avatarUrl: profile.avatarUrl,
          passwordHash: null,
          globalRole: GlobalRole.USER,
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
        role: "school_admin" as const,
        schoolId: null as string | null,
        schoolSlug: null as string | null,
        schoolName: null as string | null,
        membershipId: null as string | null,
      };

      // Token without school: use a dedicated onboard role or allow null schoolId
      const { token } = issueToken(user, onboardingCtx);

      return {
        user: toPublicUser(user, user.memberships, onboardingCtx),
        token,
        needsOrganization: true as const,
      };
    }

    // Link Google if user registered with email/password first
    if (!user.googleId) {
      user = await prisma.user.update({
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
    } else if (user.googleId !== profile.googleId) {
      throw new ConflictError(
        "This email is linked to a different Google account"
      );
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    // Platform admin
    if (user.globalRole === GlobalRole.SUPER_ADMIN) {
      const ctx = resolveAuthContext(user, input.organizationId);
      const { token } = issueToken(user, ctx);
      return {
        user: toPublicUser(user, user.memberships, ctx),
        token,
        needsOrganization: false as const,
      };
    }

    const activeMemberships = user.memberships.filter(
      (m) => m.isActive && m.organization.isActive
    );

    if (activeMemberships.length === 0) {
      const onboardingCtx = {
        role: "school_admin" as const,
        schoolId: null as string | null,
        schoolSlug: null as string | null,
        schoolName: null as string | null,
        membershipId: null as string | null,
      };
      const { token } = issueToken(user, onboardingCtx);
      return {
        user: toPublicUser(user, user.memberships, onboardingCtx),
        token,
        needsOrganization: true as const,
      };
    }

    const ctx = resolveAuthContext(user, input.organizationId);
    const { token } = issueToken(user, ctx);

    return {
      user: toPublicUser(user, user.memberships, ctx),
      token,
      needsOrganization: false as const,
    };
  },

  async me(userId: string, tokenCtx: AuthTokenPayload) {
    const user = await loadUserById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError("User not found or inactive");
    }

    // Re-validate membership still active when school-scoped
    if (tokenCtx.schoolId) {
      const membership = user.memberships.find(
        (m) =>
          m.organizationId === tokenCtx.schoolId &&
          m.isActive &&
          m.organization.isActive
      );
      if (!membership && user.globalRole !== GlobalRole.SUPER_ADMIN) {
        throw new ForbiddenError("School membership no longer active");
      }
    }

    const ctx = {
      role: tokenCtx.role,
      schoolId: tokenCtx.schoolId,
      schoolSlug:
        user.memberships.find((m) => m.organizationId === tokenCtx.schoolId)
          ?.organization.slug ?? null,
      schoolName:
        user.memberships.find((m) => m.organizationId === tokenCtx.schoolId)
          ?.organization.name ?? null,
      membershipId: tokenCtx.membershipId ?? null,
    };

    if (tokenCtx.role === "platform_admin") {
      ctx.schoolSlug = null;
      ctx.schoolName = null;
    }

    return toPublicUser(user, user.memberships, ctx);
  },

  /**
   * Stateless JWT: client discards token.
   * Hook for future refresh-token revoke / audit.
   */
  async logout(_userId: string) {
    return { ok: true as const };
  },

  async forgotPassword(input: ForgotPasswordBody) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    // Always same response (no email enumeration)
    const generic = {
      message: "If that email exists, a reset link has been sent.",
    };

    if (!user || !user.isActive) {
      return generic;
    }

    const rawToken = randomToken(32);
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    await prisma.passwordResetToken.create({
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

  async resetPassword(input: ResetPasswordBody) {
    const tokenHash = sha256(input.token);

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestError("Invalid or expired reset token");
    }

    if (!record.user.isActive) {
      throw new BadRequestError("Account is inactive");
    }

    const passwordHash = await hashPassword(input.password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // invalidate other outstanding tokens
      prisma.passwordResetToken.updateMany({
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

  async changePassword(userId: string, input: ChangePasswordBody) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedError();
    }
    if (!user.passwordHash) {
      throw new BadRequestError("No password set on this account");
    }

    const ok = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedError("Current password is incorrect");
    }

    if (input.currentPassword === input.newPassword) {
      throw new BadRequestError("New password must be different");
    }

    const passwordHash = await hashPassword(input.newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: "Password changed successfully" };
  },
};
