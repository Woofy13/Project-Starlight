import { Router, type IRouter } from "express";
import healthRouter from "./health";
import serversRouter from "./servers";

const router: IRouter = Router();

router.use(healthRouter);
router.use(serversRouter);

export default router;
