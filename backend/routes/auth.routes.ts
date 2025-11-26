import { Router } from "express";
import passport from "../auth/passport";
import { login, register, logout } from "../controllers/auth.controller";
import { signToken } from "../auth/jwt";
import { setAuthCookie } from "../utils/cookie";

const router = Router();

// Local JSON API
router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);

// Google OAuth start
router.get("/google", passport.authenticate("google", { scope: ["profile","email"] }));

// Google callback (no session) -> set cookie and redirect to frontend
router.get("/google/callback",
  passport.authenticate("google", { failureRedirect: "/auth/failure", session: false }),
  (req, res) => {
    const user = req.user as any;
    const token = signToken({ uid: user.id });

    const FRONTEND = process.env.FRONTEND_ORIGIN!;
    // set cookie
    setAuthCookie(res, token);

    // redirect to frontend; frontend can fetch /user/me
    res.redirect(`${FRONTEND}/auth/success`);
  }
);

router.get("/failure", (_req, res) => res.status(401).send("OAuth failed"));

export default router;
