import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../auth/jwt";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[process.env.COOKIE_NAME || "session"];
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const payload = verifyToken(token);
    // ensure payload is an object with a uid property before using it
    if (typeof payload === "object" && payload && "uid" in payload) {
      (req as any).userId = (payload as any).uid;
      return next();
    }
    return res.status(401).json({ error: "Invalid or expired session" });
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}
