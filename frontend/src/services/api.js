import axios from 'axios';

// Get API endpoint from environment variable or use placeholder
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/dev';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
});

// Add request interceptor for logging (optional)
apiClient.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method.toUpperCase(), config.url);
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
      // Server responded with error status
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

export default apiClient;
