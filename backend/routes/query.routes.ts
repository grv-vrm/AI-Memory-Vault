import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  askQuery,
  queryGraph,
  queryInsights,
  semanticSearch,
  summarizeQuery,
} from "../controllers/query.controller";

const router = Router();

router.post("/search", requireAuth, semanticSearch);
router.post("/ask", requireAuth, askQuery);
router.post("/summarize", requireAuth, summarizeQuery);
router.post("/graph", requireAuth, queryGraph);
router.post("/insights", requireAuth, queryInsights);

export default router;
