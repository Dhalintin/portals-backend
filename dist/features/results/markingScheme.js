"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markingSchemeSchema = exports.markingSchemeId = void 0;
exports.schemeDetails = schemeDetails;
exports.validateSchemeMarks = validateSchemeMarks;
exports.termScheme = termScheme;
exports.readMarkingScheme = readMarkingScheme;
exports.updateMarkingScheme = updateMarkingScheme;
const zod_1 = require("zod");
const errors_1 = require("../../lib/errors");
const schoolTransaction_1 = require("../../lib/schoolTransaction");
const rbac_1 = require("../../auth/rbac");
exports.markingSchemeId = zod_1.z.enum(['CA20_20_EXAM60', 'CA15_15_EXAM70']);
exports.markingSchemeSchema = zod_1.z.object({ schemeId: exports.markingSchemeId }).strict();
function schemeDetails(id) { return { id, ca1: id === 'CA15_15_EXAM70' ? 15 : 20, ca2: id === 'CA15_15_EXAM70' ? 15 : 20, exam: id === 'CA15_15_EXAM70' ? 70 : 60 }; }
function validateSchemeMarks(id, marks) { const limits = schemeDetails(id); for (const field of ['ca1', 'ca2', 'exam']) {
    const value = marks[field];
    if (value != null && (!Number.isFinite(value) || value < 0 || value > limits[field]))
        throw new errors_1.AppError(400, 'INVALID_SCORE', `${field.toUpperCase()} must be between 0 and ${limits[field]} for this term.`);
} }
// Called inside schoolTransaction: scheme changes and score writes serialize together.
async function termScheme(tx, organizationId, termId, freeze = false) {
    const term = await tx.term.findFirst({ where: { id: termId, session: { organizationId } }, select: { id: true, markingScheme: true } });
    if (!term)
        throw new errors_1.AppError(404, 'TERM_NOT_FOUND', 'Term not found');
    if (term.markingScheme)
        return term.markingScheme;
    const school = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { markingScheme: true } });
    if (freeze)
        await tx.term.update({ where: { id: termId }, data: { markingScheme: school.markingScheme } });
    return school.markingScheme;
}
async function configuration(tx, organizationId) {
    const school = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { markingScheme: true } });
    const term = await tx.term.findFirst({ where: { isCurrent: true, session: { organizationId, isCurrent: true } }, select: { id: true, name: true, markingScheme: true, session: { select: { name: true } } } });
    const locked = term ? await tx.score.count({ where: { result: { organizationId, termId: term.id } } }) > 0 : false;
    return { defaultScheme: schemeDetails(school.markingScheme), currentTerm: term ? { id: term.id, name: term.name, sessionName: term.session.name, scheme: schemeDetails(term.markingScheme ?? school.markingScheme), locked } : null };
}
function readMarkingScheme(organizationId) { return (0, schoolTransaction_1.schoolTransaction)(organizationId, tx => configuration(tx, organizationId)); }
function updateMarkingScheme(organizationId, actorId, raw) {
    const { schemeId } = exports.markingSchemeSchema.parse(raw);
    return (0, schoolTransaction_1.schoolTransaction)(organizationId, async (tx) => {
        const actor = await tx.membership.findFirst({ where: { organizationId, userId: actorId, isActive: true, user: { isActive: true } } });
        if (!actor || !(0, rbac_1.membershipRoles)(actor).includes('PROPRIETOR'))
            throw new errors_1.AppError(403, 'FORBIDDEN', 'Only a school owner can change the marking scheme.');
        const before = await configuration(tx, organizationId), term = before.currentTerm;
        if (term?.locked && term.scheme.id !== schemeId)
            throw new errors_1.AppError(409, 'MARKING_SCHEME_LOCKED', 'Score entry has started for this term. Choose a new scheme after starting the next term. Existing marks will remain unchanged.');
        await tx.organization.update({ where: { id: organizationId }, data: { markingScheme: schemeId } });
        if (term)
            await tx.term.update({ where: { id: term.id }, data: { markingScheme: schemeId } });
        await tx.auditLog.create({ data: { organizationId, actorId, action: 'SETTINGS_CHANGED', entity: 'Organization', entityId: organizationId, metadata: { operation: 'MARKING_SCHEME_CHANGED', from: before.defaultScheme.id, to: schemeId, termId: term?.id ?? null } } });
        return configuration(tx, organizationId);
    });
}
