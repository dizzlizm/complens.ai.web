import axios from 'axios';
import authService from './auth';

// Get API endpoint from environment variable or use placeholder
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/dev';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
  withCredentials: true, // Allow credentials for CORS
});

// Add request interceptor to attach auth token
apiClient.interceptors.request.use(
  async (config) => {
    console.log('API Request:', config.method.toUpperCase(), config.url);

    // Get ID token and attach to Authorization header
    try {
      const idToken = await authService.getIdToken();
      if (idToken) {
        config.headers.Authorization = `Bearer ${idToken}`;
        console.log('Authorization header added');
      } else {
        console.log('No auth token available');
      }
    } catch (error) {
      console.warn('Failed to get auth token:', error.message);
    }

    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    console.error('API Error:', error.response?.status, error.message);

    if (error.response) {
      // Handle authentication errors
      if (error.response.status === 401) {
        console.warn('Unauthorized - clearing auth tokens');
        authService.clearTokens();
        // Redirect to login if not already there
        if (window.location.pathname !== '/login') {
          window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
        }
      }

      // Log the full error response for debugging
      console.error('Full error response:', error.response.data);

      // In dev mode, log stack trace if available
      if (error.response.data?.stack) {
        console.error('Server stack trace:', error.response.data.stack);
      }

      throw new Error(error.response.data?.error || error.response.data?.message || 'Server error');
    } else if (error.request) {
      // Request made but no response
      throw new Error('No response from server. Please check your connection.');
    } else {
      // Request setup error
      throw new Error(error.message || 'Request failed');
    }
  }
);

/**
 * Send a message to the chat API
 * @param {string} message - User message
 * @param {string|null} conversationId - Optional conversation ID
 * @returns {Promise<Object>} - API response with assistant message
 */
export async function sendMessage(message, conversationId = null) {
  try {
    const response = await apiClient.post('/chat', {
      message,
      conversationId,
    });

    return response.data;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

/**
 * Get all conversations
 * @returns {Promise<Array>} - List of conversations
 */
export async function getConversations() {
  try {
    const response = await apiClient.get('/conversations');
    return response.data.conversations;
  } catch (error) {
    console.error('Error getting conversations:', error);
    throw error;
  }
}

/**
 * Get a specific conversation by ID
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} - Conversation details with messages
 */
export async function getConversation(conversationId) {
  try {
    const response = await apiClient.get(`/conversations/${conversationId}`);
    return response.data;
  } catch (error) {
    console.error('Error getting conversation:', error);
    throw error;
  }
}

/**
 * Health check
 * @returns {Promise<Object>} - Health status
 */
export async function healthCheck() {
  try {
    const response = await apiClient.get('/health');
    return response.data;
  } catch (error) {
    console.error('Health check failed:', error);
    throw error;
  }
}

// Alias for consistency
export const getHealth = healthCheck;

/**
 * Get Google Workspace OAuth status (uses tenantContext from JWT)
 * @returns {Promise<Object>} - OAuth connection status
 */
export async function getOAuthStatus() {
  try {
    const response = await apiClient.get('/oauth/google/status');
    return response.data;
  } catch (error) {
    console.error('Error getting OAuth status:', error);
    throw error;
  }
}

/**
 * Disconnect Google Workspace OAuth (uses tenantContext from JWT)
 * @returns {Promise<Object>} - Disconnect response
 */
export async function disconnectOAuth() {
  try {
    const response = await apiClient.post('/oauth/google/disconnect', {});
    return response.data;
  } catch (error) {
    console.error('Error disconnecting OAuth:', error);
    throw error;
  }
}

/**
 * Get all users for current user's organization (uses tenantContext from JWT)
 * @returns {Promise<Array>} - List of users
 */
export async function getUsers() {
  try {
    const response = await apiClient.get('/admin/users');
    return response.data;
  } catch (error) {
    console.error('Error getting users:', error);
    throw error;
  }
}

/**
 * Create a new user (orgId comes from tenantContext in JWT)
 * @param {Object} userData - User data (email, name, role, isActive)
 * @returns {Promise<Object>} - Created user
 */
export async function createUser(userData) {
  try {
    const response = await apiClient.post('/admin/users', userData);
    return response.data;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

/**
 * Update a user
 * @param {string} userId - User ID
 * @param {Object} userData - Updated user data
 * @returns {Promise<Object>} - Updated user
 */
export async function updateUser(userId, userData) {
  try {
    const response = await apiClient.put(`/admin/users/${userId}`, userData);
    return response.data;
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
}

/**
 * Delete a user (orgId comes from tenantContext in JWT)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Delete response
 */
export async function deleteUser(userId) {
  try {
    const response = await apiClient.delete(`/admin/users/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}

export default apiClient;
