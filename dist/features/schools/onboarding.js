"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onboardingChecklist = onboardingChecklist;
const errors_1 = require("../../lib/errors");
async function onboardingChecklist(tx, organizationId) {
    const school = await tx.organization.findFirst({ where: { id: organizationId, isActive: true } });
    if (!school)
        throw new errors_1.AppError(404, "SCHOOL_NOT_FOUND", "School not found");
    const sessions = await tx.academicSession.findMany({ where: { organizationId, isCurrent: true },
        include: { terms: { where: { isCurrent: true } } } });
    const session = sessions.length === 1 ? sessions[0] : undefined;
    const [site, subscription, classes, curriculum, students, parents] = await Promise.all([
        tx.organizationSite.count({ where: { organizationId } }),
        tx.subscription.findUnique({ where: { organizationId } }),
        tx.class.count({ where: { organizationId, isActive: true } }),
        tx.classSubject.count({ where: { organizationId, class: { organizationId, isActive: true }, subject: { organizationId, isActive: true } } }),
        session ? tx.student.count({ where: { organizationId, isActive: true,
                enrollments: { some: { organizationId, sessionId: session.id, class: { organizationId, isActive: true } } } } }) : Promise.resolve(0),
        tx.parent.count({ where: { organizationId, isActive: true,
                user: { isActive: true, memberships: { some: { organizationId, role: "PARENT", isActive: true } } },
                children: { some: { organizationId, student: { organizationId, isActive: true } } } } }),
    ]);
    const checks = [
        { key: "profile", complete: Boolean(school.name.trim() && school.slug), message: "Set the school name" },
        { key: "site", complete: site > 0, message: "Create the school site" },
        { key: "subscription", complete: Boolean(subscription && ["ACTIVE", "TRIAL"].includes(subscription.status)), message: "Activate the school subscription" },
        { key: "calendar", complete: Boolean(session && session.terms.length === 1), message: "Select one current session and one current term" },
        { key: "classes", complete: classes > 0, message: "Create an active class" },
        { key: "curriculum", complete: curriculum > 0, message: "Assign an active subject to an active class" },
        { key: "students", complete: students > 0, message: "Enrol an active student in the current session" },
        { key: "parentLogin", complete: parents > 0, message: "Connect an active parent login to an active child" },
    ];
    return { completed: school.onBoarded, readyForCompletion: checks.every(check => check.complete), checks,
        counts: { activeClasses: classes, curriculumLinks: curriculum, enrolledStudents: students, connectedParents: parents } };
}
