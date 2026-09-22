import axios from 'axios';

/**
 * Where the API lives.
 *
 * VITE_API_URL wins when set (use it for a deployed backend). Otherwise the
 * host is taken from whatever address the page was opened on, so the app
 * works unchanged from this computer (localhost) and from a phone on the
 * same Wi-Fi (192.168.x.x) without anyone editing a config file.
 */
const CONFIGURED = import.meta.env.VITE_API_URL;
const BASE_URL =
  CONFIGURED || `${window.location.protocol}//${window.location.hostname}:5000/api`;
const TOKEN_KEY = 'smartlab_token';
const PORTAL_KEY = 'smartlab_portal';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PORTAL_KEY);
  },
};

/**
 * Which sign-in page this session came from, so an expired session is sent
 * back to the right one instead of dropping an administrator on the
 * student page.
 */
export const portalStore = {
  get: () => localStorage.getItem(PORTAL_KEY) || 'public',
  set: (portal) => localStorage.setItem(PORTAL_KEY, portal),
};

export const loginPathFor = (portal) => (portal === 'admin' ? '/admin/login' : '/login');

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

// Attach the bearer token to every request.
api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Normalises every failure into an Error with a message that is safe and
 * useful to show a user, so components never have to unwrap axios shapes.
 */
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new Error('The request timed out. Please try again.'));
    }

    if (!error.response) {
      return Promise.reject(
        new Error(
          CONFIGURED
            ? `Cannot reach the SMARTLAB server at ${BASE_URL}. It may be starting up — a free service sleeps after 15 minutes idle and takes about a minute to wake.`
            : // No VITE_API_URL was compiled in, so the app is guessing at
              // port 5000 on its own host. On a deployed site that is never
              // right, and saying "check port 5000" sends somebody looking
              // in the wrong place entirely.
              'This site was built without VITE_API_URL, so it does not know where the API is. Set it in the hosting configuration and redeploy.'
        )
      );
    }

    const { status, data } = error.response;

    // An expired or invalid session: clear it and send the user to login,
    // unless they are already on the login screen submitting credentials.
    if (status === 401 && !error.config?.url?.includes('/auth/login')) {
      const target = loginPathFor(portalStore.get());
      tokenStore.clear();
      if (window.location.pathname !== target) {
        window.location.assign(`${target}?expired=1`);
      }
    }

    const err = new Error(data?.message || 'Something went wrong. Please try again.');
    err.status = status;
    err.fields = data?.errors || null;
    return Promise.reject(err);
  }
);

export default api;
