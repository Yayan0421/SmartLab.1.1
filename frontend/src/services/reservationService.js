import api from './api.js';

export const reservationService = {
  list: (params) => api.get('/reservations', { params }),
  /** The admin list with multi-computer reservations collapsed into one row. */
  groups: (params) => api.get('/reservations/groups', { params }),
  /** Approves, rejects or cancels every machine in one reservation. */
  decideBatch: (batchId, decision, note) =>
    api.patch(`/reservations/batch/${batchId}/${decision}`, { note }),
  mine: (params) => api.get('/reservations/my', { params }),
  summary: () => api.get('/reservations/summary'),
  stats: () => api.get('/reservations/stats'),
  get: (id) => api.get(`/reservations/${id}`),
  create: (payload) => api.post('/reservations', payload),
  createBulk: (payload) => api.post('/reservations/bulk', payload),
  schedule: (date) => api.get('/reservations/schedule', { params: { date } }),
  policy: () => api.get('/reservations/policy'),
  approve: (id, note) => api.patch(`/reservations/${id}/approve`, { note }),
  reject: (id, note) => api.patch(`/reservations/${id}/reject`, { note }),
  cancel: (id) => api.patch(`/reservations/${id}/cancel`),
  availability: (computer_id, date) =>
    api.get('/reservations/availability', { params: { computer_id, date } }),
};

export default reservationService;
