import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import operationsRouter from "./operations";
import insightsRouter from "./insights";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(profileRouter);
router.use(operationsRouter);
router.use(insightsRouter);

export default router;
