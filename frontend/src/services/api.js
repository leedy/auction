import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// --- Weeks ---
export const getWeeks = () => api.get('/weeks').then((r) => r.data);

// --- Lots ---
export const getLots = (weekOf) => api.get('/lots', { params: { weekOf } }).then((r) => r.data);
export const getLot = (lotId) => api.get(`/lots/${lotId}`).then((r) => r.data);

// --- Evaluations ---
export const getEvaluations = (weekOf) => api.get('/evaluations', { params: { weekOf } }).then((r) => r.data);
export const getFlagged = (weekOf) => api.get('/evaluations/flagged', { params: { weekOf } }).then((r) => r.data);
export const getSummary = (weekOf) => api.get('/evaluations/summary', { params: { weekOf } }).then((r) => r.data);
export const setFeedback = (lotId, auctionId, feedback) =>
  api.patch(`/evaluations/${lotId}/feedback`, { auctionId, feedback }).then((r) => r.data);

// --- Interests ---
export const getInterests = () => api.get('/interests').then((r) => r.data);
export const createInterest = (data) => api.post('/interests', data).then((r) => r.data);
export const updateInterest = (id, data) => api.patch(`/interests/${id}`, data).then((r) => r.data);
export const deleteInterest = (id) => api.delete(`/interests/${id}`).then((r) => r.data);
export const toggleInterest = (id) => api.patch(`/interests/${id}/toggle`).then((r) => r.data);

// --- Settings ---
export const getSettings = () => api.get('/settings').then((r) => r.data);
export const updateSettings = (data) => api.patch('/settings', data).then((r) => r.data);
export const testLLMConnection = () => api.post('/settings/test-llm').then((r) => r.data);

// --- User Picks ---
export const getPicks = (weekOf) => api.get('/picks', { params: { weekOf } }).then((r) => r.data);
export const togglePick = (lotId, auctionId, weekOf) =>
  api.post('/picks', { lotId, auctionId, weekOf }).then((r) => r.data);

export default api;
