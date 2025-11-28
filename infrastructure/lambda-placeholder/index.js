// Placeholder Lambda function for initial CloudFormation stack creation
// This will be replaced by the actual API code during deployment

exports.handler = async (event) => {
  console.log('Placeholder Lambda - waiting for actual code deployment');

  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  let path = event.rawPath || event.path || event.requestContext?.http?.path;

  // Strip stage prefix from path (e.g., /dev/chat -> /chat)
  const stage = event.requestContext?.stage;
  if (stage && path.startsWith(`/${stage}/`)) {
    path = path.substring(`/${stage}`.length);
  }

  // Handle CORS preflight OPTIONS requests
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Max-Age': '86400',
      },
      body: '',
    };
  }

  return {
    statusCode: 503,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
    },
    body: JSON.stringify({
      message: 'API is being deployed. Please wait a few moments and try again.',
      status: 'deploying'
    })
  };
};
