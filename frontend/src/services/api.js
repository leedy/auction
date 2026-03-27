import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// --- Auction Houses ---
export const getAuctionHouses = () => api.get('/auction-houses').then((r) => r.data);
export const createAuctionHouse = (data) => api.post('/auction-houses', data).then((r) => r.data);
export const updateAuctionHouse = (slug, data) => api.patch(`/auction-houses/${slug}`, data).then((r) => r.data);
export const deleteAuctionHouse = (slug) => api.delete(`/auction-houses/${slug}`).then((r) => r.data);

// --- Weeks ---
export const getWeeks = (ah) => api.get('/weeks', { params: { ah } }).then((r) => r.data);

// --- Lots ---
export const getLots = (weekOf, ah) => api.get('/lots', { params: { weekOf, ah } }).then((r) => r.data);
export const getLot = (lotId) => api.get(`/lots/${lotId}`).then((r) => r.data);

// --- Evaluations ---
export const getEvaluations = (weekOf, model, ah) => api.get('/evaluations', { params: { weekOf, model, ah } }).then((r) => r.data);
export const getFlagged = (weekOf, model, ah) => api.get('/evaluations/flagged', { params: { weekOf, model, ah } }).then((r) => r.data);
export const getSummary = (weekOf, model, ah) => api.get('/evaluations/summary', { params: { weekOf, model, ah } }).then((r) => r.data);
export const getModelsForWeek = (weekOf, ah) => api.get('/evaluations/models', { params: { weekOf, ah } }).then((r) => r.data);
export const setFeedback = (lotId, auctionId, feedback, model) =>
  api.patch(`/evaluations/${lotId}/feedback`, { auctionId, feedback, model }).then((r) => r.data);

// --- AI Evaluation ---
export const runEvaluation = (weekOf, model, ah) =>
  api.post('/evaluations/run', null, { params: { weekOf, model: model || undefined, ah } }).then((r) => r.data);
export const getEvaluationStatus = () =>
  api.get('/evaluations/status').then((r) => r.data);

// --- Interests ---
export const getInterests = () => api.get('/interests').then((r) => r.data);
export const createInterest = (data) => api.post('/interests', data).then((r) => r.data);
export const updateInterest = (id, data) => api.patch(`/interests/${id}`, data).then((r) => r.data);
export const deleteInterest = (id) => api.delete(`/interests/${id}`).then((r) => r.data);
export const toggleInterest = (id) => api.patch(`/interests/${id}/toggle`).then((r) => r.data);

// --- AI Expand ---
export const expandInterest = (name, notes) =>
  api.post('/interests/expand', { name, notes }, { timeout: 180000 }).then((r) => r.data);

// --- Settings ---
export const getSettings = () => api.get('/settings').then((r) => r.data);
export const updateSettings = (data) => api.patch('/settings', data).then((r) => r.data);
export const testLLMConnection = () => api.post('/settings/test-llm').then((r) => r.data);
export const getAvailableModels = () => api.get('/settings/models').then((r) => r.data);

// --- Scrape ---
export const scrapeAuction = (ah) => api.post('/lots/scrape', null, { params: { ah } }).then((r) => r.data);
export const updatePrices = (weekOf, ah) => api.post('/lots/update-prices', null, { params: { weekOf, ah } }).then((r) => r.data);

// --- User Picks ---
export const getPicks = (weekOf, ah) => api.get('/picks', { params: { weekOf, ah } }).then((r) => r.data);
export const togglePick = (lotId, auctionId, weekOf) =>
  api.post('/picks', { lotId, auctionId, weekOf }).then((r) => r.data);

export default api;
