// ============================================================
// API SERVICE — connects frontend to backend
// Place this file at: src/api.js
// ============================================================

const BASE_URL = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "hostelpro.student.token";
const USER_KEY = "hostelpro.student.user";

// ─── Auth Token Helpers ───────────────────────────────────
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const removeToken = () => localStorage.removeItem(TOKEN_KEY);
export const getUser = () => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; }
};
export const setUser = (u) => localStorage.setItem(USER_KEY, JSON.stringify(u));
export const removeUser = () => localStorage.removeItem(USER_KEY);

// ─── Base Fetch ───────────────────────────────────────────
async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    removeToken();
    removeUser();
    window.dispatchEvent(new Event("hostelpro:auth-expired"));
  }
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ─── Auth ─────────────────────────────────────────────────
export const api = {
  auth: {
    login: (email, password) =>
      request("/auth/login", { method: "POST", body: { email, password } }),
    register: (body) =>
      request("/auth/register", { method: "POST", body }),
  },

  // ─── Rooms ──────────────────────────────────────────────
  rooms: {
    getAll: () => request("/rooms"),
    create: (body) => request("/rooms", { method: "POST", body }),
    update: (id, body) => request(`/rooms/${id}`, { method: "PUT", body }),
    delete: (id) => request(`/rooms/${id}`, { method: "DELETE" }),
  },

  // ─── Students ───────────────────────────────────────────
  students: {
    getAll: () => request("/students"),
    getMe: () => request("/students/me"),
    create: (body) => request("/students", { method: "POST", body }),
    update: (id, body) => request(`/students/${id}`, { method: "PUT", body }),
    delete: (id) => request(`/students/${id}`, { method: "DELETE" }),
  },

  // ─── Payments ───────────────────────────────────────────
  payments: {
    getAll: () => request("/payments"),
    create: (body) => request("/payments", { method: "POST", body }),
    update: (id, body) => request(`/payments/${id}`, { method: "PUT", body }),
  },

  // ─── Events ─────────────────────────────────────────────
  events: {
    getAll: () => request("/events"),
    create: (body) => request("/events", { method: "POST", body }),
    update: (id, body) => request(`/events/${id}`, { method: "PUT", body }),
    delete: (id) => request(`/events/${id}`, { method: "DELETE" }),
    rsvp: (id, going) => request(`/events/${id}/rsvp`, { method: "POST", body: { going } }),
  },

  // ─── Food ───────────────────────────────────────────────
  food: {
    getMenu: () => request("/food/menu"),
    updateMenu: (day, body) => request(`/food/menu/${encodeURIComponent(day)}`, { method: "PUT", body }),
    getSubscriptions: () => request("/food/subscriptions"),
    createSubscription: (body) =>
      request("/food/subscriptions", { method: "POST", body }),
  },

  // ─── Cleaning ───────────────────────────────────────────
  cleaning: {
    getAll: () => request("/cleaning"),
    create: (body) => request("/cleaning", { method: "POST", body }),
    update: (id, body) => request(`/cleaning/${id}`, { method: "PUT", body }),
    assign: (id, body) => request(`/cleaning/${id}/assign`, { method: "POST", body }),
    complete: (id) => request(`/cleaning/${id}/complete`, { method: "POST" }),
    feedback: (id, rating) => request(`/cleaning/${id}/feedback`, { method: "POST", body: { rating } }),
  },

  // ─── Sports ─────────────────────────────────────────────
  sports: {
    getAll: () => request("/sports"),
    create: (body) => request("/sports", { method: "POST", body }),
    issue: (equipmentId, body) => request(`/sports/${equipmentId}/issue`, { method: "POST", body }),
    return: (equipmentId, issueId) =>
      request(`/sports/${equipmentId}/return`, { method: "POST", body: { issueId } }),
  },

};
