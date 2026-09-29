// Centralized API & WebSocket endpoint resolution
// Automatically bridges Vercel frontend deployments with Render backend

export const RENDER_BACKEND_URL = 'https://polar-61ps.onrender.com';
export const RENDER_WS_URL = 'wss://polar-61ps.onrender.com/ws/telemetry';

export function getWsUrl() {
  if (typeof window === 'undefined') return RENDER_WS_URL;

  const hostname = window.location.hostname;
  const isVercel = hostname.includes('vercel.app');

  // Vercel serverless edge does not support persistent stateful WebSockets,
  // so all Vercel clients connect directly to the live Render FastAPI WebSocket server.
  if (isVercel) {
    return RENDER_WS_URL;
  }

  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  if (isLocal) {
    return `ws://${hostname}:8000/ws/telemetry`;
  }

  // When running on Render or custom domain
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/telemetry`;
}

export function getApiUrl(endpoint) {
  // If endpoint already starts with http, return as-is
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // On Vercel, vercel.json rewrites /api/* to Render seamlessly.
  // In case of localhost development without proxy, we can use relative or direct.
  return cleanEndpoint;
}
