"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPinBodySchema = exports.pinsStatsQuerySchema = exports.updatePinBodySchema = exports.generatePinsBodySchema = exports.pinIdParamSchema = exports.listPinsQuerySchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const uuid = zod_1.z.string().uuid();
exports.listPinsQuerySchema = zod_1.z.object({
    termId: uuid.optional(),
    status: zod_1.z.nativeEnum(client_1.PinStatus).optional(),
    search: zod_1.z.string().trim().max(64).optional(), // serial (id) prefix or masked lookup
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
});
exports.pinIdParamSchema = zod_1.z.object({
    id: uuid,
});
exports.generatePinsBodySchema = zod_1.z.object({
    termId: uuid,
    quantity: zod_1.z.coerce
        .number()
        .int()
        .min(1, "Generate at least 1 PIN")
        .max(500, "Max 500 PINs per batch"),
    /** Optional absolute expiry */
    expiresAt: zod_1.z.coerce.date().optional().nullable(),
    /** Optional: same student on every card in this batch (rare) */
    studentId: uuid.optional().nullable(),
});
exports.updatePinBodySchema = zod_1.z.object({
    status: zod_1.z.enum([client_1.PinStatus.DISABLED, client_1.PinStatus.UNUSED]).optional(),
    expiresAt: zod_1.z.coerce.date().optional().nullable(),
    studentId: uuid.optional().nullable(),
});
exports.pinsStatsQuerySchema = zod_1.z.object({
    termId: uuid.optional(),
});
/** Public parent check — serial = Pin.id */
exports.verifyPinBodySchema = zod_1.z.object({
    schoolSlug: zod_1.z.string().trim().min(1).max(100),
    admissionNumber: zod_1.z.string().trim().min(1).max(50),
    serial: uuid, // Pin.id
    pin: zod_1.z.string().trim().min(6).max(32),
});
