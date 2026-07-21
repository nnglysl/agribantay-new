import axios from 'axios'

// In dev, Vite's proxy forwards /api to the backend (see vite.config.js).
// In production there's no proxy, so the full backend URL is needed —
// supplied via VITE_API_URL, which Vercel injects at build time.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api