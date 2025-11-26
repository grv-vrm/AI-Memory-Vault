import { useState } from "react";
import { apiFetch } from "../api";

export default function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState("");

  async function handleRegister() {
    try {
      const data = await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, name }),
      });
      setUser(data.user);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleLogin() {
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setUser(data.user);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleLogout() {
    await apiFetch("/auth/logout", { method: "POST" });
    setUser(null);
  }

  async function fetchMe() {
    try {
      const me = await apiFetch("/user/me");
      setUser(me);
    } catch {
      setError("Not logged in");
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "3rem auto", fontFamily: "sans-serif" }}>
      <h2>Auth Test</h2>

      <input
        placeholder="Name"
        value={name}
        onChange={e => setName(e.target.value)}
        style={{ width: "100%", marginBottom: 8 }}
      />
      <input
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ width: "100%", marginBottom: 8 }}
      />
      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ width: "100%", marginBottom: 8 }}
      />

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={handleRegister}>Register</button>
        <button onClick={handleLogin}>Login</button>
        <button onClick={handleLogout}>Logout</button>
      </div>

      <button
        style={{ marginTop: 10, background: "#4285F4", color: "white", border: "none", padding: "6px 10px" }}
        onClick={() => (window.location.href = `${import.meta.env.VITE_API_URL}/auth/google`)}
      >
        Sign in with Google
      </button>

      <button style={{ marginTop: 10 }} onClick={fetchMe}>Get /user/me</button>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {user && (
        <pre style={{ background: "#f4f4f4", padding: "10px", marginTop: "1rem" }}>
          {JSON.stringify(user, null, 2)}
        </pre>
      )}
    </div>
  );
}
