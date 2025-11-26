const router = require("express").Router();
import { presign, complete } from "../controllers/upload.controller.js";
import { requireAuth } from "../middleware/auth.js";

router.post("/presign", requireAuth, presign);
router.post("/complete", requireAuth, complete);

export default router;