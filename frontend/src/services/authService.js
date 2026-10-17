import { api, unwrap } from './api';

export const authService = {
  me: () => api.get('/auth/me').then(unwrap),
  login: (body) => api.post('/auth/login', body).then(unwrap),
  register: (body) => api.post('/auth/register', body).then(unwrap),
  logout: () => api.post('/auth/logout').then(unwrap),
  updateProfile: (body) => api.patch('/auth/me', body).then(unwrap),
  changePassword: (body) => api.put('/auth/password', body).then(unwrap),
  deleteAccount: (password) => api.delete('/auth/me', { data: { password } }).then(unwrap),
};
