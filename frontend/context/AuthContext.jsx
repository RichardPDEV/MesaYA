import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../lib/constants.js";
import { requestJson, setAccessToken, clearAccessToken } from "../lib/api.js";
import { readClientSession, writeClientSession } from "../lib/storage.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const session = readClientSession();
    if (!session) return null;
    return {
      username: session.username,
      displayName: session.displayName,
      role: session.role,
    };
  });
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(readClientSession()?.username));
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  const clearSession = () => {
    clearAccessToken();
    setUser(null);
    setIsAuthenticated(false);
    writeClientSession(null);
  };

  useEffect(() => {
    const handleLogoutEvent = () => {
      clearSession();
    };
    window.addEventListener("auth:logout", handleLogoutEvent);
    return () => window.removeEventListener("auth:logout", handleLogoutEvent);
  }, []);

  const bootstrapSession = async () => {
    setIsLoading(true);
    try {
      const profile = await requestJson(`${API_BASE_URL}/auth/me`);
      const normalizedUser = profile
        ? {
            username: profile.username,
            displayName: profile.displayName,
            role: profile.role,
          }
        : null;
      setUser(normalizedUser);
      setIsAuthenticated(Boolean(normalizedUser));
      if (normalizedUser) {
        writeClientSession({
          username: normalizedUser.username,
          displayName: normalizedUser.displayName,
          role: normalizedUser.role,
        });
      } else {
        writeClientSession(null);
      }
      setAuthError("");
    } catch (err) {
      if (err?.status === 401) {
        clearSession();
        setAuthError("");
      } else {
        setAuthError(err?.message || "No se pudo cargar la sesión");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    bootstrapSession();
  }, []);

  const login = async ({ username, password }) => {
    setAuthError("");
    const loginResp = await requestJson(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    const token = loginResp?.token;
    if (!token) {
      throw new Error("No se recibió un token de acceso");
    }

    setAccessToken(token);
    const normalizedUser = {
      username: loginResp?.username || username,
      displayName: loginResp?.displayName || username,
      role: loginResp?.role || "USER",
    };
    setUser(normalizedUser);
    setIsAuthenticated(true);
    writeClientSession({
      username: normalizedUser.username,
      displayName: normalizedUser.displayName,
      role: normalizedUser.role,
    });
    setAuthError("");
    return normalizedUser;
  };

  const register = async ({ username, password, displayName }) => {
    setAuthError("");
    await requestJson(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      body: JSON.stringify({ username, password, displayName }),
    });
    return login({ username, password });
  };

  const logout = async () => {
    try {
      await requestJson(`${API_BASE_URL}/auth/logout`, { method: "POST" });
    } catch (err) {
      console.warn("Logout request failed", err);
    }
    clearSession();
  };

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      authError,
      login,
      register,
      logout,
      refreshSession: bootstrapSession,
    }),
    [user, isAuthenticated, isLoading, authError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return context;
}
