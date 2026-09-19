import api from './api.js';

export const adminService = {
  adminDashboard: () => api.get('/dashboard/admin'),
  myDashboard: () => api.get('/dashboard/me'),
  auditLogs: (params) => api.get('/admin/audit-logs', { params }),
  settings: () => api.get('/admin/settings'),
  updateSetting: (key, payload) => api.patch(`/admin/settings/${key}`, payload),
  laboratories: () => api.get('/admin/laboratories'),
  createLaboratory: (payload) => api.post('/admin/laboratories', payload),
  reports: (params) => api.get('/admin/reports', { params }),
};

export default adminService;
