import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Expected format: Bearer <TOKEN>

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token missing'
    });
  }

  const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_access_key';

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired access token'
      });
    }

    req.user = decoded; // Decoded payload: { id, username }
    next();
  });
};
