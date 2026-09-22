import api from './api.js';

export const controlService = {
  /** Queues a command for a workstation (shutdown, restart, lock, message, wake). */
  send: (computerId, action, body) => api.post(`/control/${computerId}/${action}`, body ?? {}),

  /** Latest desktop capture from every machine, keyed by computer id. */
  screens: () => api.get('/control/screens'),

  /** Recent command history, for the activity list. */
  commands: (params) => api.get('/control/commands', { params }),
};

export default controlService;
