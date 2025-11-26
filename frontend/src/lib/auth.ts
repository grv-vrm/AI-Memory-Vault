import { apiFetch } from "../api"

export interface User {
  id: string
  email: string
  name: string
}

export interface AuthResponse {
  ok: boolean
  user?: User
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const res = await apiFetch("/user/me", { method: "GET" })
    console.log("getCurrentUser response:", res)
    // Backend returns user object directly, not wrapped in { user: ... }
    if (res && res.id) return res as User
    return null
  } catch (error) {
    console.error("getCurrentUser error:", error)
    return null
  }
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  })
}

export async function register(email: string, password: string, name: string): Promise<AuthResponse> {
  return await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name })
  })
}

export async function logout(): Promise<void> {
  await apiFetch("/auth/logout", { method: "POST" })
}
