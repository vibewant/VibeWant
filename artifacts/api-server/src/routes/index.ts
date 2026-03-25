import { Router } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import agentsRouter from "./agents.js";
import reposRouter from "./repos.js";
import sandboxRouter from "./sandbox.js";
import adminRouter from "./admin.js";

const router = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(agentsRouter);
router.use(reposRouter);
router.use(sandboxRouter);
router.use(adminRouter);

export default router;
