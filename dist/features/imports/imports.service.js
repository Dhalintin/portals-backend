"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importsService = exports.ImportsService = void 0;
const node_crypto_1 = require("node:crypto");
const errors_1 = require("../../lib/errors");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const imports_validation_1 = require("./imports.validation");
const normalized = (value) => value.trim().toLowerCase();
const classKey = (name, arm) => `${normalized(name)}::${normalized(arm ?? "")}`;
const profileKey = (row) => JSON.stringify([normalized(row.firstName), normalized(row.lastName), row.email ?? null, row.phone ?? null]);
function parseRows(schema, rows) {
    const errors = [], valid = [], seen = new Set();
    rows.forEach((row, index) => {
        const parsed = schema.safeParse(row);
        if (!parsed.success) {
            const number = row && typeof row === "object" && "rowNumber" in row && Number.isInteger(row.rowNumber) && Number(row.rowNumber) > 0 ? Number(row.rowNumber) : index + 1;
            errors.push({ rowNumber: number, message: parsed.error.issues.map(issue => `${issue.path.join(".") || "row"}: ${issue.message}`).join("; ") });
        }
        else if (seen.has(parsed.data.rowNumber))
            errors.push({ rowNumber: parsed.data.rowNumber, message: "Duplicate row number" });
        else {
            seen.add(parsed.data.rowNumber);
            valid.push(parsed.data);
        }
    });
    return { valid, errors };
}
function rejectErrors(errors) {
    if (errors.length)
        throw new errors_1.AppError(400, "IMPORT_HAS_ERRORS", "Fix row errors before importing", { errors });
}
function requestHash(kind, rows, sessionId) {
    return (0, node_crypto_1.createHash)("sha256").update(JSON.stringify({ kind, sessionId: sessionId ?? null, rows: [...rows].sort((a, b) => a.rowNumber - b.rowNumber) })).digest("hex");
}
async function replay(tx, organizationId, kind, idempotencyKey, hash) {
    const batch = await tx.importBatch.findUnique({ where: { organizationId_kind_idempotencyKey: { organizationId, kind, idempotencyKey } } });
    if (!batch)
        return null;
    if (batch.requestHash !== hash)
        throw new errors_1.AppError(409, "IDEMPOTENCY_CONFLICT", "This import key was already used for different rows or session");
    return { ...batch.result, replayed: true };
}
async function finish(tx, organizationId, kind, key, hash, created, rowCount, actorId, requestId) {
    const id = (0, node_crypto_1.randomUUID)(), result = { dryRun: false, created, errorCount: 0, errors: [], batchId: id, replayed: false };
    await tx.importBatch.create({ data: { id, organizationId, kind, idempotencyKey: key, requestHash: hash, result } });
    await tx.auditLog.create({ data: { organizationId, actorId, requestId, action: "OTHER", entity: "ImportBatch", entityId: id,
            metadata: { kind, rowCount, created } } });
    return result;
}
class ImportsService {
    async importStudents(organizationId, raw, actorId, requestId) {
        const input = imports_validation_1.importStudentsSchema.parse(raw), parsed = parseRows(imports_validation_1.studentImportRowSchema, input.rows);
        const hash = requestHash("STUDENTS", parsed.valid, input.sessionId);
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            if (!input.dryRun) {
                rejectErrors(parsed.errors);
                const prior = await replay(tx, organizationId, "STUDENTS", input.idempotencyKey, hash);
                if (prior)
                    return prior;
            }
            if (input.sessionId && !await tx.academicSession.findFirst({ where: { id: input.sessionId, organizationId } })) {
                throw new errors_1.AppError(400, "INVALID_SESSION", "Session must belong to this school");
            }
            const classes = await tx.class.findMany({ where: { organizationId, isActive: true }, select: { id: true, name: true, arm: true } });
            const classMap = new Map();
            for (const cls of classes) {
                const key = classKey(cls.name, cls.arm);
                classMap.set(key, classMap.has(key) ? null : cls.id);
            }
            const existing = await tx.student.findMany({ where: { organizationId }, select: { admissionNumber: true } });
            const admissions = new Set(existing.map(row => normalized(row.admissionNumber))), seen = new Set();
            const errors = [...parsed.errors], valid = [];
            for (const row of parsed.valid) {
                const admission = normalized(row.admissionNumber);
                let message = seen.has(admission) ? "Duplicate admission number in file" : admissions.has(admission) ? "Admission number already exists in school" : null;
                seen.add(admission);
                const classId = row.className ? classMap.get(classKey(row.className, row.classArm)) : null;
                if (row.className && !classId)
                    message = "Class is missing, inactive or ambiguous in this school";
                if (input.sessionId && !classId)
                    message = "A class is required when importing session enrollments";
                if (message)
                    errors.push({ rowNumber: row.rowNumber, message });
                else
                    valid.push({ ...row, classId: classId ?? null });
            }
            const subscription = await tx.subscription.findUnique({ where: { organizationId } });
            const active = await tx.student.count({ where: { organizationId, isActive: true } });
            const seatsLeft = Math.max(0, (subscription?.studentCap ?? 100) - active), capExceeded = valid.length > seatsLeft;
            if (input.dryRun)
                return { dryRun: true, validCount: valid.length, errorCount: errors.length, errors,
                    sample: valid.slice(0, 5), seatsLeft, capExceeded, canCommit: !errors.length && !capExceeded };
            rejectErrors(errors);
            if (capExceeded)
                throw new errors_1.AppError(403, "STUDENT_CAP_REACHED", "Import exceeds the student subscription limit", { seatsLeft });
            const students = valid.map(row => ({ id: (0, node_crypto_1.randomUUID)(), organizationId, admissionNumber: row.admissionNumber,
                firstName: row.firstName, lastName: row.lastName, otherNames: row.otherNames ?? null, gender: row.gender ?? null,
                dateOfBirth: row.dateOfBirth ?? null, classId: row.classId, parentPhone: row.parentPhone ?? null, parentEmail: row.parentEmail ?? null }));
            await tx.student.createMany({ data: students });
            if (input.sessionId) {
                const enrollments = students.filter(row => row.classId).map(row => ({ organizationId, studentId: row.id, classId: row.classId, sessionId: input.sessionId }));
                if (enrollments.length)
                    await tx.studentEnrollment.createMany({ data: enrollments });
            }
            return finish(tx, organizationId, "STUDENTS", input.idempotencyKey, hash, students.length, input.rows.length, actorId, requestId);
        });
    }
    async importParents(organizationId, raw, actorId, requestId) {
        const input = imports_validation_1.importParentsSchema.parse(raw), parsed = parseRows(imports_validation_1.parentImportRowSchema, input.rows), hash = requestHash("PARENTS", parsed.valid);
        return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
            if (!input.dryRun) {
                rejectErrors(parsed.errors);
                const prior = await replay(tx, organizationId, "PARENTS", input.idempotencyKey, hash);
                if (prior)
                    return prior;
            }
            const students = await tx.student.findMany({ where: { organizationId, isActive: true }, select: { id: true, admissionNumber: true } });
            const byAdmission = new Map();
            for (const student of students) {
                const key = normalized(student.admissionNumber);
                byAdmission.set(key, byAdmission.has(key) ? null : student.id);
            }
            const parents = await tx.parent.findMany({ where: { organizationId }, select: { email: true, phone: true } });
            const existingContacts = new Set(parents.flatMap(parent => [...(parent.email ? [`email:${normalized(parent.email)}`] : []), ...(parent.phone ? [`phone:${parent.phone.trim()}`] : [])]));
            const contacts = new Map(), links = new Set(), errors = [...parsed.errors];
            const groups = new Map();
            for (const row of parsed.valid) {
                const identity = profileKey(row), keys = [...(row.email ? [`email:${row.email}`] : []), ...(row.phone ? [`phone:${row.phone}`] : [])];
                const groupKey = keys.length ? identity : `${identity}:${row.rowNumber}`;
                const studentId = row.studentAdmissionNumber ? byAdmission.get(normalized(row.studentAdmissionNumber)) : null;
                let message = row.studentAdmissionNumber && !studentId ? "Student is missing, inactive or ambiguous in this school" : null;
                if (keys.some(key => existingContacts.has(key)))
                    message = "Parent contact already exists in this school; use the parent link/update flow";
                if (keys.some(key => contacts.has(key) && contacts.get(key) !== identity))
                    message = "Conflicting parent profiles share a contact in this file";
                const linkKey = `${identity}:${studentId ?? "unlinked"}`;
                if (links.has(linkKey))
                    message = "Duplicate parent/child row in file";
                if (message) {
                    errors.push({ rowNumber: row.rowNumber, message });
                    continue;
                }
                keys.forEach(key => contacts.set(key, identity));
                links.add(linkKey);
                let group = groups.get(groupKey);
                if (!group) {
                    group = { id: (0, node_crypto_1.randomUUID)(), row, links: [] };
                    groups.set(groupKey, group);
                }
                if (studentId)
                    group.links.push({ studentId, relation: row.relation ?? null });
            }
            if (input.dryRun)
                return { dryRun: true, validCount: input.rows.length - errors.length, parentCount: groups.size,
                    errorCount: errors.length, errors, sample: [...groups.values()].slice(0, 5).map(group => group.row), canCommit: !errors.length };
            rejectErrors(errors);
            const profiles = [...groups.values()];
            await tx.parent.createMany({ data: profiles.map(group => ({ id: group.id, organizationId, firstName: group.row.firstName,
                    lastName: group.row.lastName, email: group.row.email ?? null, phone: group.row.phone ?? null })) });
            const children = profiles.flatMap(group => group.links.map(link => ({ organizationId, parentId: group.id, ...link, isPrimary: true })));
            if (children.length)
                await tx.parentStudent.createMany({ data: children });
            return finish(tx, organizationId, "PARENTS", input.idempotencyKey, hash, profiles.length, input.rows.length, actorId, requestId);
        });
    }
}
exports.ImportsService = ImportsService;
exports.importsService = new ImportsService();
