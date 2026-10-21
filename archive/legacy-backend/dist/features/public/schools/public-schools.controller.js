"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicSchoolsController = void 0;
// import { sendSuccess } from "@/lib/http";
// import { AppError } from "@/lib/errors/AppError";
const public_schools_service_1 = require("./public-schools.service");
const dto_1 = require("../dto");
const response_1 = require("../../../common/http/response");
const AppError_1 = require("../../../common/errors/AppError");
const service = new public_schools_service_1.PublicSchoolsService();
class PublicSchoolsController {
    list = async (req, res, next) => {
        try {
            console.log("Here!");
            const query = dto_1.listPublicSchoolsQuerySchema.parse(req.query);
            const data = await service.list(query);
            console.log(data);
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (err) {
            return next(err);
        }
    };
    getBySlug = async (req, res, next) => {
        try {
            const slug = String(req.params.slug ?? "").trim();
            if (!slug)
                throw new AppError_1.AppError(400, "Slug is required");
            const data = await service.getBySlug(slug);
            if (!data)
                throw new AppError_1.AppError(404, "School not found");
            return (0, response_1.sendSuccess)(res, data);
        }
        catch (err) {
            return next(err);
        }
    };
}
exports.PublicSchoolsController = PublicSchoolsController;
