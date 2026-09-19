import api from './api.js';

export const computerService = {
  list: (params) => api.get('/computers', { params }),
  stats: () => api.get('/computers/stats'),
  get: (id) => api.get(`/computers/${id}`),
  create: (payload) => api.post('/computers', payload),
  update: (id, payload) => api.patch(`/computers/${id}`, payload),
  remove: (id) => api.delete(`/computers/${id}`),
  laboratories: () => api.get('/computers/laboratories'),
  monitoring: () => api.get('/monitoring'),
  monitoringDetail: (id) => api.get(`/monitoring/${id}`),
};

export default computerService;
