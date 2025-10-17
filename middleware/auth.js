import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    console.log('🔐 Auth middleware triggered');
    console.log('Auth header received:', authHeader ? 'Yes' : 'No');
    console.log('Request path:', req.path);
    console.log('Request method:', req.method);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No Bearer token found in header');
      return res.status(401).json({
        success: false,
        error: 'No token provided, access denied'
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    
    console.log('Token received, length:', token.length);
    console.log('Token preview:', token.substring(0, 20) + '...');

    // Check if token is not just empty or too short
    if (token.length < 10) {
      console.log('❌ Token too short, likely invalid');
      return res.status(401).json({
        success: false,
        error: 'Invalid token format'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('✅ Token decoded successfully for user:', decoded.userId);
      
      // Get user from token
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        console.log('❌ User not found for ID:', decoded.userId);
        return res.status(401).json({
          success: false,
          error: 'Token is not valid, user not found'
        });
      }

      req.user = user;
      console.log('✅ Authentication successful for:', user.username);
      next();
    } catch (jwtError) {
      console.error('❌ JWT verification error:', jwtError);
      
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Invalid token'
        });
      }
      
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired'
        });
      }

      throw jwtError; // Re-throw unexpected JWT errors
    }

  } catch (error) {
    console.error('🔴 Auth middleware unexpected error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Server error in authentication'
    });
  }
};

// Optional: Create a more permissive middleware for optional authentication
const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without user
    }

    const token = authHeader.substring(7);
    
    if (token.length < 10) {
      return next(); // Continue without user
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user) {
        req.user = user;
        console.log('Optional auth successful for:', user.username);
      }
    } catch (jwtError) {
      // Silently fail for optional auth
      console.log('Optional auth failed, continuing without user');
    }
    
    next();
  } catch (error) {
    console.error('Optional auth error:', error);
    next(); // Continue without user even on error
  }
};

export { authenticate, optionalAuthenticate };