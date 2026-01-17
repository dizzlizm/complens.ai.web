const response = require('../../shared/response');

exports.handler = async () => {
  return response.ok({
    status: 'healthy',
    service: 'complens-api',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
};
