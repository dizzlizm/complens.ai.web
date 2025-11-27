/**
 * Secrets Manager Service
 * Handles retrieval of secrets from AWS Secrets Manager
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

class SecretsService {
  constructor(secretArn, region = 'us-east-1') {
    this.secretArn = secretArn;
    this.client = new SecretsManagerClient({ region });
    this.cache = null;
    this.cacheTimestamp = null;
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get secrets from Secrets Manager with caching
   * @returns {Object} - Parsed secrets object
   */
  async getSecrets() {
    // Return cached secrets if still valid
    if (this.cache && this.cacheTimestamp && Date.now() - this.cacheTimestamp < this.cacheTTL) {
      console.log('Returning cached secrets');
      return this.cache;
    }

    try {
      console.log('Fetching secrets from Secrets Manager');

      const command = new GetSecretValueCommand({
        SecretId: this.secretArn,
      });

      const response = await this.client.send(command);

      // Parse secret string
      const secrets = JSON.parse(response.SecretString);

      // Cache the secrets
      this.cache = secrets;
      this.cacheTimestamp = Date.now();

      console.log('Secrets retrieved and cached successfully');

      return secrets;

    } catch (error) {
      console.error('Error retrieving secrets:', error);
      throw new Error(`Failed to retrieve secrets: ${error.message}`);
    }
  }

  /**
   * Get a specific secret value
   * @param {string} key - Secret key to retrieve
   * @returns {string} - Secret value
   */
  async getSecret(key) {
    const secrets = await this.getSecrets();
    return secrets[key];
  }

  /**
   * Clear the secrets cache (useful for testing or rotation)
   */
  clearCache() {
    this.cache = null;
    this.cacheTimestamp = null;
    console.log('Secrets cache cleared');
  }
}

module.exports = { SecretsService };
