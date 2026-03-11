import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  createChatSession,
  deleteChatSession,
  getChatHistory,
  setChatRetention,
} from "../controllers/chat.controller";

const router = Router();

router.get("/history", requireAuth, getChatHistory);
router.post("/session", requireAuth, createChatSession);
router.post("/retention", requireAuth, setChatRetention);
router.delete("/session", requireAuth, deleteChatSession);

export default router;
