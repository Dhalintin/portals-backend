import type { RequestHandler } from 'express';
import { authenticate } from './authenticate';
import { billingAccess } from '../features/subscriptions/termBilling';
import { AppError } from '../lib/errors';
// Billing recovery, calendar setup, account recovery and payment reconciliation remain available.
export function billingExempt(path: string, method: string) {
    return ['GET', 'HEAD', 'OPTIONS'].includes(method) || /^\/(subscription|platform|academic)(\/|$)/.test(path) || path.startsWith('/fees/parent/') || (path === '/students/portal/me' && method === 'PATCH') || /\/read$/.test(path);
}
export const requireTermSubscription: RequestHandler = (req, res, next) => {
    if (billingExempt(req.path, req.method))
        return next();
    authenticate(req, res, async (error) => { if (error)
        return next(error); if (!req.auth?.schoolId)
        return next(); try {
        const access = await billingAccess(req.auth.schoolId);
        if (!access.canWrite)
            return next(new AppError(402, 'SUBSCRIPTION_REQUIRED', 'This school needs a paid term subscription. Existing records and exports remain available. A school owner or bursar can open Subscription to settle the balance.', { status: access.status, graceEnds: access.graceEnds }));
        next();
    }
    catch (e) {
        next(e);
    } });
};
