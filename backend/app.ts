import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import passport from "./auth/passport";
import uploadRoutes from "./routes/upload.routes";
import queryRoutes from "./routes/query.routes";
import chatRoutes from "./routes/chat.routes";

const app = express();
app.use(express.json());
app.use(cookieParser());

const allowedOrigins = new Set<string>([
  process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser tools or same-origin requests without Origin header.
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

// initialize passport for OAuth only (we're not using session storage)
app.use(passport.initialize());

app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/upload", uploadRoutes);
app.use("/query", queryRoutes);
app.use("/chat", chatRoutes);

app.get("/", (_req, res) => res.send("API OK"));

export default app;
