import axios from 'axios'

// In dev, Vite's proxy forwards /api to the backend (see vite.config.js).
// In production there's no proxy, so the full backend URL is needed —
// supplied via VITE_API_URL, which Vercel injects at build time.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Accept': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  // Only set Content-Type for plain JSON bodies. FormData requests
  // (file uploads) must NOT have Content-Type set manually — axios
  // needs to generate its own multipart boundary, and a fixed
  // 'application/json' or hardcoded 'multipart/form-data' header
  // (without a boundary) breaks the request server-side.
  if (!(config.data instanceof FormData) && !config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json'
  }

  return config
})

export default api