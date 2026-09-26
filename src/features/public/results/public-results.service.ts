import { PinStatus, Prisma } from "@prisma/client";

import type { VerifyResultInput } from "../dto";
import { AppError } from "../../../common/errors/AppError";
import { prisma } from "../../../lib/prisma";

function formatTermName(name: string): string {
  const map: Record<string, string> = {
    FIRST: "First Term",
    SECOND: "Second Term",
    THIRD: "Third Term",
  };
  return map[name] ?? name;
}

export class PublicResultsService {
  /**
   * Verify admission + serial + PIN and return published result
   * for the term the pin is tied to.
   */
  async verify(input: VerifyResultInput, meta?: { ip?: string }) {
    const { organizationSlug, admissionNumber, serial, code } = input;

    const org = await prisma.organization.findFirst({
      where: { slug: organizationSlug, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        primaryColor: true,
        accentColor: true,
        motto: true,
      },
    });

    if (!org) {
      throw new AppError(404, "School not found or inactive");
    }

    // Serial = Pin.id; code must match; must belong to this school
    const pin = await prisma.pin.findFirst({
      where: {
        id: serial,
        organizationId: org.id,
        code,
      },
      select: {
        id: true,
        code: true,
        status: true,
        termId: true,
        studentId: true,
        expiresAt: true,
        organizationId: true,
        term: {
          select: {
            id: true,
            name: true,
            isCurrent: true,
            session: {
              select: {
                id: true,
                name: true,
                isCurrent: true,
              },
            },
          },
        },
      },
    });

    // Generic message — do not reveal whether serial or code was wrong
    if (!pin) {
      throw new AppError(401, "Invalid serial number or PIN");
    }

    if (pin.status === PinStatus.DISABLED) {
      throw new AppError(
        403,
        "This PIN has been disabled. Contact the school."
      );
    }

    if (pin.status === PinStatus.EXPIRED) {
      throw new AppError(403, "This PIN has expired.");
    }

    if (pin.expiresAt && pin.expiresAt.getTime() < Date.now()) {
      // Soft-expire if date passed but status not updated
      await prisma.pin
        .update({
          where: { id: pin.id },
          data: { status: PinStatus.EXPIRED },
        })
        .catch(() => undefined);
      throw new AppError(403, "This PIN has expired.");
    }

    const student = await prisma.student.findFirst({
      where: {
        organizationId: org.id,
        admissionNumber: {
          equals: admissionNumber,
          mode: "insensitive",
        },
        isActive: true,
      },
      select: {
        id: true,
        admissionNumber: true,
        firstName: true,
        lastName: true,
        otherNames: true,
        gender: true,
        classId: true,
        class: {
          select: {
            id: true,
            name: true,
            arm: true,
            level: true,
          },
        },
      },
    });

    if (!student) {
      throw new AppError(
        404,
        "No active student found with that admission number"
      );
    }

    // Optional pre-assignment: pin locked to one student
    if (pin.studentId && pin.studentId !== student.id) {
      throw new AppError(
        403,
        "This PIN is not valid for this admission number"
      );
    }

    const result = await prisma.result.findUnique({
      where: {
        studentId_termId: {
          studentId: student.id,
          termId: pin.termId,
        },
      },
      select: {
        id: true,
        totalScore: true,
        percentage: true,
        position: true,
        grade: true,
        remark: true,
        isPublished: true,
        publishedAt: true,
        classId: true,
        scores: {
          orderBy: { subject: { name: "asc" } },
          select: {
            id: true,
            ca1: true,
            ca2: true,
            exam: true,
            total: true,
            grade: true,
            remark: true,
            subject: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        class: {
          select: {
            id: true,
            name: true,
            arm: true,
            level: true,
          },
        },
      },
    });

    if (!result || !result.isPublished) {
      throw new AppError(
        404,
        "Results for this term are not available yet. Please check back later."
      );
    }

    // Consume pin on first successful view (UNUSED → USED)
    if (pin.status === PinStatus.UNUSED) {
      await prisma.pin.update({
        where: { id: pin.id },
        data: {
          status: PinStatus.USED,
          usedAt: new Date(),
          usedByIp: meta?.ip?.slice(0, 64) ?? null,
          // Bind pin to this student if it was open stock
          studentId: pin.studentId ?? student.id,
        },
      });
    }

    const termLabel = `${pin.term.session.name} · ${formatTermName(
      pin.term.name
    )}`;

    return {
      school: {
        name: org.name,
        slug: org.slug,
        logoUrl: org.logoUrl,
        primaryColor: org.primaryColor,
        accentColor: org.accentColor,
        motto: org.motto,
      },
      student: {
        admissionNumber: student.admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        otherNames: student.otherNames,
        gender: student.gender,
        class: result.class ?? student.class,
      },
      term: {
        id: pin.term.id,
        name: pin.term.name,
        label: termLabel,
        sessionName: pin.term.session.name,
      },
      result: {
        id: result.id,
        totalScore: result.totalScore,
        percentage: result.percentage,
        position: result.position,
        grade: result.grade,
        remark: result.remark,
        publishedAt: result.publishedAt,
        scores: result.scores.map((s) => ({
          subjectId: s.subject.id,
          subjectName: s.subject.name,
          subjectCode: s.subject.code,
          ca1: s.ca1,
          ca2: s.ca2,
          exam: s.exam,
          total: s.total,
          grade: s.grade,
          remark: s.remark,
        })),
      },
      pin: {
        serial: pin.id,
        status: PinStatus.USED, // after successful check
        // never return code
      },
    };
  }
}
