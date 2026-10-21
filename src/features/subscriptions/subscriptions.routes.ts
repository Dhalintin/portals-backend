import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { requireSchool } from "../../middlewares/requireSchool";
import { SubscriptionsController } from "./subscriptions.controller";

const c = new SubscriptionsController();
const subscriptionRoutes = Router();

subscriptionRoutes.use(authenticate, requireSchool);
subscriptionRoutes.get("/", c.get);

export default subscriptionRoutes;
