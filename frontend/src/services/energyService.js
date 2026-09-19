import api from './api.js';

export const energyService = {
  summary: () => api.get('/energy/summary'),
  series: (params) => api.get('/energy', { params }),
  byComputer: (params) => api.get('/energy/by-computer', { params }),
  forComputer: (id, params) => api.get(`/energy/${id}`, { params }),
};

export default energyService;
