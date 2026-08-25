"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const express_validator_1 = require("express-validator");
const customResponse_1 = require("../utils/customResponse");
/**
 * Drop this at the end of any express-validator chain.
 * Collects all errors and returns a structured 422 response if any exist.
 *
 * Usage:
 *   [body("title").notEmpty(), ..., validate]
 */
const validate = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (errors.isEmpty()) {
        next();
        return;
    }
    const formatted = errors.array().map((err) => ({
        field: err.type === "field" ? err.path : undefined,
        message: err.msg,
    }));
    (0, customResponse_1.customResponse)({
        status: 422,
        res,
        success: false,
        message: "Validation failed.",
        data: { errors: formatted },
    });
};
exports.validate = validate;
