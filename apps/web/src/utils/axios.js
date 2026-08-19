import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true, // send/receive the httpOnly auth cookies
});

// These endpoints must never trigger a refresh-retry, or we'd loop.
const NO_REFRESH = ["/auth/login", "/auth/signup", "/auth/refresh", "/auth/me", "/auth/logout"];

// Share a single in-flight refresh across concurrent 401s.
let refreshing = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const url = original?.url || "";

    if (status === 401 && original && !original._retry && !NO_REFRESH.some((p) => url.includes(p))) {
      original._retry = true;
      try {
        refreshing = refreshing || api.post("/auth/refresh");
        await refreshing;
        refreshing = null;
        return api(original); // retry with the rotated access-token cookie
      } catch (refreshErr) {
        refreshing = null;
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
