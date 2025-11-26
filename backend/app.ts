import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import passport from "./auth/passport";
import uploadRoutes from "./routes/upload.routes";

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN,
  credentials: true
}));

// initialize passport for OAuth only (we're not using session storage)
app.use(passport.initialize());

app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/upload", uploadRoutes);

app.get("/", (_req, res) => res.send("API OK"));

export default app;
