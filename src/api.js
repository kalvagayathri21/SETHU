const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const API_ORIGIN = /^https?:\/\//i.test(API_BASE) ? new URL(API_BASE).origin : "";

export function getApiAssetUrl(path) {
  if (!path || !path.startsWith("/uploads/") || !API_ORIGIN) return path;
  return `${API_ORIGIN}${path}`;
}

function getCookie(name) {
  const prefix = `${name}=`;
  const cookie = document.cookie.split("; ").find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
}

export async function apiRequest(path, { method = "GET", body, headers = {}, ...options } = {}) {
  const upperMethod = method.toUpperCase();
  const requestHeaders = new Headers(headers);
  if (body !== undefined && !(body instanceof FormData)) requestHeaders.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(upperMethod)) {
    const csrf = getCookie("sethu_csrf");
    if (csrf) requestHeaders.set("X-CSRF-Token", csrf);
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method: upperMethod,
    headers: requestHeaders,
    credentials: "include",
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body)
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.code = payload.code;
    error.details = payload.details;
    throw error;
  }
  return payload;
}

export function getApiErrorMessage(error) {
  if (error instanceof TypeError) return "The SETHU API is unavailable. Start the backend and check its database configuration.";
  if (error?.status === 500) return "The SETHU API returned an internal error. Check the backend logs and database configuration.";
  return error?.message || "The request could not be completed.";
}
