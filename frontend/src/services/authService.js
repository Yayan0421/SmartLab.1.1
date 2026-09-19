import api, { tokenStore, portalStore } from './api.js';

export const authService = {
  /**
   * `portal` tells the API which sign-in page this came from. The server
   * keeps administrators and students/faculty on separate portals, so the
   * wrong role signing in here is rejected there, not just hidden here.
   */
  async login(email, password, portal = 'public') {
    const res = await api.post('/auth/login', { email, password, portal });
    tokenStore.set(res.data.token);
    portalStore.set(portal);
    return res.data.user;
  },

  async register(payload) {
    const res = await api.post('/auth/register', payload);
    tokenStore.set(res.data.token);
    portalStore.set('public');
    return res.data.user;
  },

  /** Administrator signup — requires the ADMIN_SIGNUP_CODE from the server. */
  async registerAdmin(payload) {
    const res = await api.post('/auth/register-admin', payload);
    tokenStore.set(res.data.token);
    portalStore.set('admin');
    return res.data.user;
  },

  async me() {
    const res = await api.get('/auth/me');
    return res.data;
  },

  async logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      tokenStore.clear();
    }
  },

  async updateProfile(payload) {
    const res = await api.patch('/auth/profile', payload);
    return res.data;
  },

  async uploadAvatar(image) {
    const res = await api.post('/auth/avatar', { image });
    return res.data;
  },

  async removeAvatar() {
    const res = await api.delete('/auth/avatar');
    return res.data;
  },

  changePassword(current_password, new_password) {
    return api.post('/auth/change-password', { current_password, new_password });
  },
};

export default authService;
