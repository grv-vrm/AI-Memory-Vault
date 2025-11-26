import type { CookieOptions } from "express";

const isProd = process.env.NODE_ENV === "production";

export const COOKIE_NAME = process.env.COOKIE_NAME || "session";

export const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax", // "none" + secure if cross-site frontend
  maxAge: Number(process.env.COOKIE_MAX_AGE || 7 * 24 * 60 * 60 * 1000), // 7 days
  path: "/"
};

// helper to set cookie
export const setAuthCookie = (res: any, token: string) => {
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
};

// helper to clear cookie
export const clearAuthCookie = (res: any) => {
  res.clearCookie(COOKIE_NAME, { path: COOKIE_OPTIONS.path });
};
