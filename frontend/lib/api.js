import { API_BASE_URL } from "./constants.js";

let ACCESS_TOKEN = null;
export function setAccessToken(token) { ACCESS_TOKEN = token; }
export function clearAccessToken() { ACCESS_TOKEN = null; }

export async function requestJson(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (ACCESS_TOKEN) headers["Authorization"] = `Bearer ${ACCESS_TOKEN}`;
  const response = await fetch(url, {
    headers,
    credentials: "include",
    ...options,
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && url.indexOf("/auth/refresh") === -1) {
      try {
        const refreshResp = await fetch(`${API_BASE_URL}/auth/refresh`, { method: "POST", credentials: "include" });
        if (refreshResp.ok) {
          const text2 = await refreshResp.text();
          let payload2 = null;
          try { payload2 = JSON.parse(text2); } catch { payload2 = text2; }
          ACCESS_TOKEN = payload2?.token || ACCESS_TOKEN;
          return await requestJson(url, options);
        }
      } catch {
        // ignore
      }
    }
    const err = new Error(payload?.message || `Request failed with status ${response.status}`);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}
