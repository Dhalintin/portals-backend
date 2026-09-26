import type { Request, Response, NextFunction } from "express";
// import { sendSuccess } from "@/lib/http";
// import { AppError } from "@/lib/errors/AppError";
import { PublicSchoolsService } from "./public-schools.service";
import { listPublicSchoolsQuerySchema } from "../dto";
import { sendSuccess } from "../../../common/http/response";
import { AppError } from "../../../common/errors/AppError";

const service = new PublicSchoolsService();

export class PublicSchoolsController {
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log("Here!");
      const query = listPublicSchoolsQuerySchema.parse(req.query);
      const data = await service.list(query);
      console.log(data);
      return sendSuccess(res, data);
    } catch (err) {
      return next(err);
    }
  };

  getBySlug = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const slug = String(req.params.slug ?? "").trim();
      if (!slug) throw new AppError(400, "Slug is required");
      const data = await service.getBySlug(slug);
      if (!data) throw new AppError(404, "School not found");
      return sendSuccess(res, data);
    } catch (err) {
      return next(err);
    }
  };
}
