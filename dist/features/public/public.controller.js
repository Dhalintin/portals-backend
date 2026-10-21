"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicController = exports.PublicController = void 0;
const public_service_1 = require("./public.service");
const public_validation_1 = require("./public.validation");
const http_1 = require("../../lib/http");
class PublicController {
    getBrand = async (req, res, next) => {
        try {
            const { slug } = public_validation_1.slugParamSchema.parse(req.params);
            const data = await public_service_1.publicService.getBrandBySlug(slug);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    getSiteStatus = async (req, res, next) => {
        try {
            const { slug } = public_validation_1.slugParamSchema.parse(req.params);
            const data = await public_service_1.publicService.getSiteStatus(slug);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
    listSchools = async (req, res, next) => {
        try {
            const query = public_validation_1.publicDirectoryQuerySchema.parse(req.query);
            const data = await public_service_1.publicService.listPublicSchools(query);
            (0, http_1.sendSuccess)(res, data);
        }
        catch (err) {
            next(err);
        }
    };
}
exports.PublicController = PublicController;
exports.publicController = new PublicController();
