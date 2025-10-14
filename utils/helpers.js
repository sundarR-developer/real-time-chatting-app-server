// Format response
const formatResponse = (success, data = null, message = '', error = null) => {
  return {
    success,
    data,
    message,
    error,
    timestamp: new Date().toISOString()
  };
};

// Sanitize user data
const sanitizeUser = (user) => {
  if (!user) return null;
  
  const userObj = user.toObject ? user.toObject() : user;
  
  const { password, __v, ...sanitizedUser } = userObj;
  return sanitizedUser;
};

// Generate random string
const generateRandomString = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Validate email
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Pagination helper
const paginate = (page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  return { skip, limit: parseInt(limit) };
};

export {
  formatResponse,
  sanitizeUser,
  generateRandomString,
  isValidEmail,
  paginate
};