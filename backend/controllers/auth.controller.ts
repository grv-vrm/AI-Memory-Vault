import type { Request, Response } from "express";
import { hashPassword, verifyPassword } from "../auth/password";
import { signToken } from "../auth/jwt";
import { prisma } from "../prisma/client";
import { setAuthCookie, clearAuthCookie } from "../utils/cookie";


export async function register(req: Request, res: Response) {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email+password required" });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "Email already in use" });

    const hashed = await hashPassword(password);
    const user = await prisma.user.create({ data: { email, name, password: hashed } });
    const token = signToken({ uid: user.id });

    setAuthCookie(res, token);
    res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
}

export async function login(req: Request, res: Response) {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email+password required" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await verifyPassword(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken({ uid: user.id });
    setAuthCookie(res, token);
    res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
}

export function logout(req: Request, res: Response) {
    clearAuthCookie(res);
    res.json({ ok: true });
}
