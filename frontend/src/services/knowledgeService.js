import { api, unwrap, unwrapList } from './api';

export const documentService = {
  list: (params) => api.get('/documents', { params }).then(unwrapList),
  get: (id, params) => api.get(`/documents/${id}`, { params }).then(unwrap),
  upload: (files, onProgress) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    return api
      .post('/documents/upload', form, {
        timeout: 0,
        onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
      })
      .then(unwrap);
  },
  rename: (id, title) => api.patch(`/documents/${id}`, { title }).then(unwrap),
  reprocess: (id) => api.post(`/documents/${id}/reprocess`).then(unwrap),
  remove: (id) => api.delete(`/documents/${id}`).then(unwrap),
  fileUrl: (id) => `/api/documents/${id}/file`,
};

export const noteService = {
  list: (params) => api.get('/notes', { params }).then(unwrapList),
  tags: () => api.get('/notes/tags').then(unwrap),
  get: (id) => api.get(`/notes/${id}`).then(unwrap),
  create: (body) => api.post('/notes', body).then(unwrap),
  update: (id, body) => api.put(`/notes/${id}`, body).then(unwrap),
  remove: (id) => api.delete(`/notes/${id}`).then(unwrap),
};

export const searchService = {
  search: (body) => api.post('/search', body).then(unwrap),
  chunk: (id) => api.get(`/chunks/${id}`).then(unwrap),
};

export const statsService = {
  dashboard: () => api.get('/stats').then(unwrap),
  graph: () => api.get('/graph').then(unwrap),
};
