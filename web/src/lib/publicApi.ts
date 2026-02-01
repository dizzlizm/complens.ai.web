import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

// Public API client - no authentication required
export const publicApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default publicApi;
