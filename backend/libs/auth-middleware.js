import jwt from 'jsonwebtoken';
import User from '../models/user.js'; // ✅ ADD THIS IMPORT

export const authenticateToken = async (req, res, next) => { // ✅ MAKE IT ASYNC
  // Try to get token from HTTP-only cookie first, then fallback to Authorization header
  let token = req.cookies?.auth_token;
  
  // Fallback to Authorization header for backward compatibility
  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    
    // ✅ ADD THESE LINES - Fetch user with workspace info
    const user = await User.findById(decoded.userId)
      .populate('workspaces.workspaceId', 'name')
      .populate('currentWorkspace', 'name');
    
    if (!user) {
      return res.status(403).json({ message: 'User not found' });
    }
    
    req.user = user; // ✅ ADD user object to request
    
    // ✅ ADD workspace role detection
    const workspaceId = req.headers['workspace-id'] || user.currentWorkspace?._id;
    if (workspaceId) {
      const workspaceRole = user.workspaces?.find(
        w => w.workspaceId._id.toString() === workspaceId.toString()
      )?.role;
      req.workspaceRole = workspaceRole;
      req.currentWorkspaceId = workspaceId;
    }
    // ✅ END OF NEW LINES
    
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};
