import type { Request, Response, NextFunction } from "express";
import { publicService } from "./public.service";
import {
  slugParamSchema,
  publicDirectoryQuerySchema,
} from "./public.validation";
import { sendSuccess } from "../../lib/http";

export class PublicController {
  getBrand = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug } = slugParamSchema.parse(req.params);
      const data = await publicService.getBrandBySlug(slug);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  getSiteStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug } = slugParamSchema.parse(req.params);
      const data = await publicService.getSiteStatus(slug);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  listSchools = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = publicDirectoryQuerySchema.parse(req.query);
      const data = await publicService.listPublicSchools(query);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}

export const publicController = new PublicController();
