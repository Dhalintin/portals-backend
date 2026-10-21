import type { Request, Response, NextFunction } from "express";

import { PublicResultsService } from "./public-results.service";
import { verifyResultSchema } from "../dto";
import { sendSuccess } from "../../../common/http/response";

const service = new PublicResultsService();

function clientIp(req: Request): string | undefined {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0]?.trim();
  return req.socket?.remoteAddress ?? undefined;
}

export class PublicResultsController {
  verify = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = verifyResultSchema.parse(req.body);
      const data = await service.verify(body, { ip: clientIp(req) });
      return sendSuccess(res, data);
    } catch (err) {
      return next(err);
    }
  };
}
