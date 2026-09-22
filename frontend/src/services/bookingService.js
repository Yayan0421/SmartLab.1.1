import api from './api.js';

export const bookingService = {
  list: (params) => api.get('/bookings', { params }),
  /** The admin list with multi-computer reservations collapsed into one row. */
  groups: (params) => api.get('/bookings/groups', { params }),
  /** Approves, rejects or cancels every machine in one reservation. */
  decideBatch: (batchId, decision, note) =>
    api.patch(`/bookings/batch/${batchId}/${decision}`, { note }),
  mine: (params) => api.get('/bookings/my', { params }),
  summary: () => api.get('/bookings/summary'),
  stats: () => api.get('/bookings/stats'),
  get: (id) => api.get(`/bookings/${id}`),
  create: (payload) => api.post('/bookings', payload),
  createBulk: (payload) => api.post('/bookings/bulk', payload),
  schedule: (date) => api.get('/bookings/schedule', { params: { date } }),
  policy: () => api.get('/bookings/policy'),
  approve: (id, note) => api.patch(`/bookings/${id}/approve`, { note }),
  reject: (id, note) => api.patch(`/bookings/${id}/reject`, { note }),
  cancel: (id) => api.patch(`/bookings/${id}/cancel`),
  availability: (computer_id, date) =>
    api.get('/bookings/availability', { params: { computer_id, date } }),
};

export default bookingService;
