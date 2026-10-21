// platform-billing.controller.ts
import type { Request, Response, NextFunction } from "express";

import { PlatformBillingService } from "./platform-billing.service";
import {
  listBillingQuerySchema,
  recordPaymentSchema,
  organizationIdParamSchema,
} from "./dto";
import { sendSuccess } from "../../../common/http/response";

const service = new PlatformBillingService();

export class PlatformBillingController {
  overview = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      return sendSuccess(res, await service.overview());
    } catch (e) {
      return next(e);
    }
  };

  listSchools = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listBillingQuerySchema.parse(req.query);
      return sendSuccess(res, await service.listSchools(query));
    } catch (e) {
      return next(e);
    }
  };

  recordPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = organizationIdParamSchema.parse(req.params);
      const body = recordPaymentSchema.parse(req.body);
      const userId = (req as { user?: { sub?: string } }).user?.sub;
      const data = await service.recordPayment(organizationId, body, userId);
      return sendSuccess(res, data, 201);
    } catch (e) {
      return next(e);
    }
  };

  listPayments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = organizationIdParamSchema.parse(req.params);
      return sendSuccess(res, await service.listPayments(organizationId));
    } catch (e) {
      return next(e);
    }
  };
}
