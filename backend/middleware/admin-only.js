export const adminOnly = (req, res, next) => {
  const role = req.user?.role;
  if (!role || !['admin', 'super_admin'].includes(role)) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

