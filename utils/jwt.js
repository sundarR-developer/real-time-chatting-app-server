import jwt from 'jsonwebtoken';

const generateToken = (payload, expiresIn = null) => {
  const options = expiresIn ? { expiresIn } : {};
  return jwt.sign(payload, process.env.JWT_SECRET, options);
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

const decodeToken = (token) => {
  return jwt.decode(token);
};

export { generateToken, verifyToken, decodeToken };