// middleware/isloggedin.js
const jwt = require('jsonwebtoken');

// FIXED: Add the missing generateToken function
const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user._id,
      email: user.email 
    }, 
    process.env.JWT_SECRET || 'your-secret-key', 
    { expiresIn: '24h' }
  );
};

// FIXED: Complete verifyToken function with proper user lookup
function verifyToken(req, res, next) {
  try {
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      // Allow certain routes without authentication
      if ((req.path === '/report' && req.method === 'POST') || 
          req.path === '/home' || 
          req.path === '/about' || 
          req.path === '/htu' || 
          req.path === '/allreports') {
        req.user = null;
        req.userId = null;
        return next();
      }
      return res.redirect('/login');
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', async (err, decoded) => {
      if (err) {
        console.error('JWT verification error:', err);
        // Allow certain routes without authentication
        if ((req.path === '/report' && req.method === 'POST') || 
            req.path === '/home' || 
            req.path === '/about' || 
            req.path === '/htu' || 
            req.path === '/allreports') {
          req.user = null;
          req.userId = null;
          return next();
        }
        return res.redirect('/login');
      }

      try {
        // FIXED: Proper token structure - use userId directly, not nested under user
        if (decoded && decoded.userId) {
          // FIXED: Get user from database using the userId from token
          const Reporter = require('../models/reporter');
          const user = await Reporter.findById(decoded.userId);
          
          if (user) {
            req.user = user;
            req.userId = user._id;
          } else {
            // User not found in database
            req.user = null;
            req.userId = null;
          }
        } else {
          // Invalid token structure
          req.user = null;
          req.userId = null;
        }
        
        next();
      } catch (dbError) {
        console.error('Database lookup error:', dbError);
        // Set defaults if database lookup fails
        req.user = null;
        req.userId = null;
        next();
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    // Allow certain routes without authentication
    if ((req.path === '/report' && req.method === 'POST') || 
        req.path === '/home' || 
        req.path === '/about' || 
        req.path === '/htu' || 
        req.path === '/allreports') {
      req.user = null;
      req.userId = null;
      return next();
    }
    res.redirect('/login');
  }
}

module.exports = { generateToken, verifyToken };
