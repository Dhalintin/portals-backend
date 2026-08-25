"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = notFound;
const AppError_1 = require("../errors/AppError");
function notFound(_req, _res, next) {
    next(new AppError_1.NotFoundError(`Route not found`));
}
