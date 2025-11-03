import jwt from 'jsonwebtoken';
import User from '../models/user.js';

export const authenticateToken = async (req, res, next) => {
  // Prefer Authorization header with Bearer scheme; fallback to HTTP-only cookie for backward compatibility
  let token;

  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || !/^Bearer$/i.test(parts[0]) || !parts[1]) {
      return res.status(401).json({ message: "Invalid Authorization header format. Use 'Bearer <token>'" });
    }
    token = parts[1];
  } else if (req.cookies?.auth_token) {
    token = req.cookies.auth_token;
  }

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;

    // Fetch user with workspace info
    const user = await User.findById(decoded.userId)
      .populate('workspaces.workspaceId', 'name')
      .populate('currentWorkspace', 'name');

    if (!user) {
      return res.status(403).json({ message: 'User not found' });
    }

    req.user = user;

    // Workspace role/context detection
    const workspaceId = req.headers['workspace-id'] || user.currentWorkspace?._id;
    if (workspaceId) {
      const workspaceRole = user.workspaces?.find(
        (w) => w.workspaceId._id.toString() === workspaceId.toString()
      )?.role;
      req.workspaceRole = workspaceRole;
      req.currentWorkspaceId = workspaceId;
    }

    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};
