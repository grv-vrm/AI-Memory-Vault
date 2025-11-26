// src/pages/Profile.tsx
import React, { useEffect, useState } from "react";
import { apiFetch } from "../api";

export default function Profile() {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadUser() {
    setLoading(true);
    setError(null);
    try {
      const u = await apiFetch("/user/me");
      setUser(u);
    } catch (e: any) {
      setError(e?.message ?? "Not logged in");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUser();
  }, []);

  if (loading) return <div style={{padding:20}}>Loading…</div>;
  if (error)
    return (
      <div style={{ padding: 20 }}>
        <p style={{ color: "red" }}>{error}</p>
        <p>
          Try <a href="/auth">login</a> or the main page.
        </p>
      </div>
    );

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif", maxWidth: 700 }}>
      <h2>Current user</h2>
      {user ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div>
            <strong>ID:</strong> {user.id}
          </div>
          <div>
            <strong>Name:</strong> {user.name ?? "—"}
          </div>
          <div>
            <strong>Email:</strong> {user.email ?? "—"}
          </div>
          {user.image && <img src={user.image} alt="avatar" style={{width:96, height:96, borderRadius:8}}/>}
          <pre style={{ background: "#f6f6f6", padding: 12 }}>{JSON.stringify(user, null, 2)}</pre>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={async () => {
                await apiFetch("/auth/logout", { method: "POST" });
                setUser(null);
              }}
            >
              Logout
            </button>
            <button onClick={loadUser}>Refresh</button>
          </div>
        </div>
      ) : (
        <p>Not logged in</p>
      )}
    </div>
  );
}
