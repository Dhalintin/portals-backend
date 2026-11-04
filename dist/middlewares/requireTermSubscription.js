"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireTermSubscription = void 0;
exports.billingExempt = billingExempt;
const authenticate_1 = require("./authenticate");
const termBilling_1 = require("../features/subscriptions/termBilling");
const errors_1 = require("../lib/errors");
// Billing recovery, calendar setup, account recovery and payment reconciliation remain available.
function billingExempt(path, method) {
    return ['GET', 'HEAD', 'OPTIONS'].includes(method) || /^\/(subscription|platform|academic)(\/|$)/.test(path) || path.startsWith('/fees/parent/') || (path === '/students/portal/me' && method === 'PATCH') || /\/read$/.test(path);
}
const requireTermSubscription = (req, res, next) => {
    if (billingExempt(req.path, req.method))
        return next();
    (0, authenticate_1.authenticate)(req, res, async (error) => {
        if (error)
            return next(error);
        if (!req.auth?.schoolId)
            return next();
        try {
            const access = await (0, termBilling_1.billingAccess)(req.auth.schoolId);
            if (!access.canWrite)
                return next(new errors_1.AppError(402, 'SUBSCRIPTION_REQUIRED', 'This school needs a paid term subscription. Existing records and exports remain available. A school owner or bursar can open Subscription to settle the balance.', { status: access.status, graceEnds: access.graceEnds }));
            next();
        }
        catch (e) {
            next(e);
        }
    });
};
exports.requireTermSubscription = requireTermSubscription;
