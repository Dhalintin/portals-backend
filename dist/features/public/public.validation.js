"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicDirectoryQuerySchema = exports.slugParamSchema = void 0;
const zod_1 = require("zod");
exports.slugParamSchema = zod_1.z.object({
    slug: zod_1.z
        .string()
        .min(2)
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug"),
});
exports.publicDirectoryQuerySchema = zod_1.z.object({
    search: zod_1.z.string().max(100).optional(),
    state: zod_1.z.string().max(50).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(50).default(20),
    cursor: zod_1.z.string().uuid().optional(),
});
