/**
 * Standardized API response helpers.
 * All responses follow: { success, statusCode, message, data, timestamp }
 */

const sendSuccess = (res, data = null, message = 'Operation completed successfully', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    statusCode,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
};

const sendError = (res, statusCode = 500, message = 'An error occurred', errors = null) => {
  const body = {
    success: false,
    statusCode,
    message,
    timestamp: new Date().toISOString(),
  };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

const sendValidationError = (res, errors) => {
  return res.status(422).json({
    success: false,
    statusCode: 422,
    message: 'Validation failed',
    errors: errors.map((e) => ({ field: e.path || e.param, message: e.msg })),
    timestamp: new Date().toISOString(),
  });
};

module.exports = { sendSuccess, sendError, sendValidationError };
