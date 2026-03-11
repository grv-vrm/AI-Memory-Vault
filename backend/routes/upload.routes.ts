import { Router } from "express";
import { presign, complete } from "../controllers/upload.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/presign", requireAuth, presign);
router.post("/complete", requireAuth, complete);

export default router;
