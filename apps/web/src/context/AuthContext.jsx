import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../utils/axios";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("/auth/me");
      setUser(res.data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Ends the session. The cookie is httpOnly, so only the server can clear it —
   * but the local user is cleared either way. If the request fails (expired
   * cookie, server down) the person still asked to leave, and refusing to sign
   * them out would trap them in a session they no longer want.
   */
  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Deliberately ignored — see above.
    } finally {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
};
