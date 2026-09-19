import api from './api.js';

export const userService = {
  list: (params) => api.get('/users', { params }),
  stats: () => api.get('/users/stats'),
  get: (id) => api.get(`/users/${id}`),
  create: (payload) => api.post('/users', payload),
  update: (id, payload) => api.patch(`/users/${id}`, payload),
  resetPassword: (id, new_password) =>
    api.post(`/users/${id}/reset-password`, new_password ? { new_password } : {}),
  deactivate: (id) => api.delete(`/users/${id}`),
  reissueQr: (id) => api.post(`/users/${id}/reissue-qr`),
  lookupByQr: (code) => api.get(`/users/by-qr/${encodeURIComponent(code)}`),
};

export default userService;
