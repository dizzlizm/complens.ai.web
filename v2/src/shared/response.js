/**
 * Standard API response helpers
 */

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ENVIRONMENT === 'prod'
    ? 'https://app.complens.ai'
    : '*',
};

exports.ok = (body) => ({
  statusCode: 200,
  headers: corsHeaders,
  body: JSON.stringify(body),
});

exports.created = (body) => ({
  statusCode: 201,
  headers: corsHeaders,
  body: JSON.stringify(body),
});

exports.noContent = () => ({
  statusCode: 204,
  headers: corsHeaders,
});

exports.badRequest = (message) => ({
  statusCode: 400,
  headers: corsHeaders,
  body: JSON.stringify({ error: message }),
});

exports.unauthorized = (message = 'Unauthorized') => ({
  statusCode: 401,
  headers: corsHeaders,
  body: JSON.stringify({ error: message }),
});

exports.forbidden = (message = 'Forbidden') => ({
  statusCode: 403,
  headers: corsHeaders,
  body: JSON.stringify({ error: message }),
});

exports.notFound = (message = 'Not found') => ({
  statusCode: 404,
  headers: corsHeaders,
  body: JSON.stringify({ error: message }),
});

exports.serverError = (message = 'Internal server error') => ({
  statusCode: 500,
  headers: corsHeaders,
  body: JSON.stringify({ error: message }),
});

exports.redirect = (url) => ({
  statusCode: 302,
  headers: {
    Location: url,
  },
});
