import { OrgRole, PinStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma"; // adjust
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../common/errors/AppError";
import type {
  GeneratePinsBody,
  ListPinsQuery,
  PinsStatsQuery,
  UpdatePinBody,
  VerifyPinBody,
} from "./pins.dto";
import {
  formatPinCodeDisplay,
  generatePinCode,
  maskPinCode,
  normalizePinCode,
} from "./pins.codes";

type Actor = {
  userId: string;
  orgRole?: OrgRole | string | null;
  globalRole?: string;
  schoolId: string;
};

function assertManager(actor: Actor) {
  const ok =
    actor.orgRole === OrgRole.SCHOOL_ADMIN ||
    actor.orgRole === OrgRole.EXAM_OFFICER ||
    actor.globalRole === "SUPER_ADMIN";
  if (!ok) {
    throw new ForbiddenError(
      "Only school admin or exam officer can manage PIN cards"
    );
  }
}

async function assertTermInOrg(termId: string, organizationId: string) {
  const term = await prisma.term.findFirst({
    where: { id: termId, session: { organizationId } },
    include: {
      session: { select: { id: true, name: true, organizationId: true } },
    },
  });
  if (!term) throw new NotFoundError("Term not found for this school");
  return term;
}

const pinListSelect = {
  id: true,
  code: true,
  organizationId: true,
  termId: true,
  studentId: true,
  status: true,
  usedAt: true,
  usedByIp: true,
  expiresAt: true,
  createdAt: true,
  term: {
    select: {
      id: true,
      name: true,
      session: { select: { id: true, name: true } },
    },
  },
  student: {
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      lastName: true,
    },
  },
} satisfies Prisma.PinSelect;

function toListItem(pin: {
  id: string;
  code: string;
  organizationId: string;
  termId: string;
  studentId: string | null;
  status: PinStatus;
  usedAt: Date | null;
  usedByIp: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  term: {
    id: string;
    name: string;
    session: { id: string; name: string };
  };
  student: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
  } | null;
}) {
  return {
    id: pin.id, // serial
    serial: pin.id,
    codeMasked: maskPinCode(pin.code),
    // Never return full code on list
    organizationId: pin.organizationId,
    termId: pin.termId,
    studentId: pin.studentId,
    status: pin.status,
    usedAt: pin.usedAt,
    usedByIp: pin.usedByIp,
    expiresAt: pin.expiresAt,
    createdAt: pin.createdAt,
    term: pin.term,
    student: pin.student,
  };
}

export class PinsService {
  async list(organizationId: string, query: ListPinsQuery) {
    const { termId, status, search, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PinWhereInput = {
      organizationId,
      ...(termId ? { termId } : {}),
      ...(status ? { status } : {}),
      ...(search?.trim()
        ? {
            OR: [
              { id: { startsWith: search.trim() } },
              {
                student: {
                  admissionNumber: {
                    contains: search.trim(),
                    mode: "insensitive",
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.pin.findMany({
        where,
        select: pinListSelect,
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
      }),
      prisma.pin.count({ where }),
    ]);

    return {
      items: rows.map(toListItem),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async stats(organizationId: string, query: PinsStatsQuery) {
    const base: Prisma.PinWhereInput = {
      organizationId,
      ...(query.termId ? { termId: query.termId } : {}),
    };

    const [total, unused, used, expired, disabled] = await Promise.all([
      prisma.pin.count({ where: base }),
      prisma.pin.count({ where: { ...base, status: PinStatus.UNUSED } }),
      prisma.pin.count({ where: { ...base, status: PinStatus.USED } }),
      prisma.pin.count({ where: { ...base, status: PinStatus.EXPIRED } }),
      prisma.pin.count({ where: { ...base, status: PinStatus.DISABLED } }),
    ]);

    return {
      termId: query.termId ?? null,
      total,
      unused,
      used,
      expired,
      disabled,
    };
  }

  async getById(organizationId: string, id: string) {
    const pin = await prisma.pin.findFirst({
      where: { id, organizationId },
      select: pinListSelect,
    });
    if (!pin) throw new NotFoundError("PIN not found");
    return toListItem(pin);
  }

  /**
   * Generate N unique PIN cards for a term.
   * Returns full code + serial (id) ONCE for printing — not available again on list.
   */
  async generate(organizationId: string, body: GeneratePinsBody, actor: Actor) {
    assertManager(actor);
    await assertTermInOrg(body.termId, organizationId);

    if (body.studentId) {
      const student = await prisma.student.findFirst({
        where: {
          id: body.studentId,
          organizationId,
          isActive: true,
        },
      });
      if (!student) throw new NotFoundError("Student not found");
    }

    if (body.expiresAt && body.expiresAt.getTime() < Date.now()) {
      throw new BadRequestError("Expiry must be in the future");
    }

    const quantity = body.quantity;
    const created: { id: string; code: string; codeDisplay: string }[] = [];

    // Retry unique collisions on code
    const maxAttempts = quantity * 5;
    let attempts = 0;

    await prisma.$transaction(async (tx) => {
      while (created.length < quantity) {
        attempts += 1;
        if (attempts > maxAttempts) {
          throw new BadRequestError(
            "Could not generate enough unique PIN codes. Try a smaller batch."
          );
        }

        const code = normalizePinCode(generatePinCode(12));

        try {
          const pin = await tx.pin.create({
            data: {
              code,
              organizationId,
              termId: body.termId,
              studentId: body.studentId ?? null,
              status: PinStatus.UNUSED,
              expiresAt: body.expiresAt ?? null,
            },
            select: { id: true, code: true },
          });
          created.push({
            id: pin.id,
            code: pin.code,
            codeDisplay: formatPinCodeDisplay(pin.code),
          });
        } catch (e: unknown) {
          // Unique violation on code — retry
          if (
            e &&
            typeof e === "object" &&
            "code" in e &&
            (e as { code: string }).code === "P2002"
          ) {
            continue;
          }
          throw e;
        }
      }
    });

    return {
      termId: body.termId,
      quantity: created.length,
      /** Full secrets — print/PDF only; do not persist in frontend long-term */
      pins: created.map((p) => ({
        serial: p.id,
        id: p.id,
        code: p.code,
        codeDisplay: p.codeDisplay,
      })),
      generatedAt: new Date().toISOString(),
      warning:
        "Save or print these codes now. Full codes are not shown again in the admin list.",
    };
  }

  async update(
    organizationId: string,
    id: string,
    body: UpdatePinBody,
    actor: Actor
  ) {
    assertManager(actor);

    const pin = await prisma.pin.findFirst({
      where: { id, organizationId },
    });
    if (!pin) throw new NotFoundError("PIN not found");

    if (pin.status === PinStatus.USED && body.status === PinStatus.UNUSED) {
      throw new BadRequestError("A used PIN cannot be reset to unused");
    }

    if (body.studentId) {
      const student = await prisma.student.findFirst({
        where: { id: body.studentId, organizationId, isActive: true },
      });
      if (!student) throw new NotFoundError("Student not found");
    }

    const updated = await prisma.pin.update({
      where: { id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
        ...(body.studentId !== undefined ? { studentId: body.studentId } : {}),
      },
      select: pinListSelect,
    });

    return toListItem(updated);
  }

  async disable(organizationId: string, id: string, actor: Actor) {
    return this.update(
      organizationId,
      id,
      { status: PinStatus.DISABLED },
      actor
    );
  }

  /**
   * Parent verify: serial (Pin.id) + code must both match.
   * Marks UNUSED → USED on success. Returns published result only.
   */
  async verifyPublic(body: VerifyPinBody, clientIp?: string) {
    const org = await prisma.organization.findFirst({
      where: { slug: body.schoolSlug, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        motto: true,
      },
    });
    if (!org) throw new NotFoundError("School not found");

    const student = await prisma.student.findFirst({
      where: {
        organizationId: org.id,
        admissionNumber: body.admissionNumber.trim(),
        isActive: true,
      },
    });

    // Generic errors — avoid leaking which field failed
    const invalid = () => {
      throw new BadRequestError("Invalid serial, PIN, or admission number");
    };

    if (!student) invalid();

    const pin = await prisma.pin.findFirst({
      where: {
        id: body.serial,
        organizationId: org.id,
      },
      include: {
        term: {
          select: {
            id: true,
            name: true,
            session: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!pin) invalid();

    const submitted = normalizePinCode(body.pin);
    const stored = normalizePinCode(pin!.code);
    if (submitted !== stored) invalid();

    if (pin!.status === PinStatus.DISABLED) {
      throw new BadRequestError("This PIN card has been disabled");
    }

    if (pin!.status === PinStatus.EXPIRED) {
      throw new BadRequestError("This PIN card has expired");
    }

    if (pin!.expiresAt && pin!.expiresAt < new Date()) {
      await prisma.pin.update({
        where: { id: pin!.id },
        data: { status: PinStatus.EXPIRED },
      });
      throw new BadRequestError("This PIN card has expired");
    }

    // Pre-assigned card must match this student
    if (pin!.studentId && pin!.studentId !== student!.id) {
      invalid();
    }

    // Already used: allow re-view only for the same bound student (optional policy)
    if (pin!.status === PinStatus.USED) {
      if (pin!.studentId && pin!.studentId !== student!.id) {
        throw new BadRequestError("This PIN card has already been used");
      }
      // If used but not bound, bind was set on first use — check studentId after first use
      if (pin!.studentId === student!.id || !pin!.studentId) {
        // allow fetch if published (re-check)
      } else {
        throw new BadRequestError("This PIN card has already been used");
      }
    }

    const result = await prisma.result.findUnique({
      where: {
        studentId_termId: {
          studentId: student!.id,
          termId: pin!.termId,
        },
      },
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            lastName: true,
            otherNames: true,
            gender: true,
            classId: true,
          },
        },
        term: {
          select: {
            id: true,
            name: true,
            isCurrent: true,
            session: { select: { id: true, name: true, isCurrent: true } },
          },
        },
        class: {
          select: { id: true, name: true, arm: true, level: true },
        },
        scores: {
          include: {
            subject: { select: { id: true, name: true, code: true } },
          },
          orderBy: { subject: { name: "asc" } },
        },
      },
    });

    if (!result || !result.isPublished) {
      throw new BadRequestError(
        "Result is not available yet. Please check back after the school publishes this term."
      );
    }

    if (pin!.status === PinStatus.UNUSED) {
      await prisma.pin.update({
        where: { id: pin!.id },
        data: {
          status: PinStatus.USED,
          usedAt: new Date(),
          usedByIp: clientIp ?? null,
          studentId: pin!.studentId ?? student!.id,
        },
      });
    }

    return {
      school: org,
      term: pin!.term,
      result,
    };
  }
}

export const pinsService = new PinsService();
