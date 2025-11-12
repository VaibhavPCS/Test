import Project from '../models/project.js';
import ProjectHistory from '../models/project-history.js';
import User from '../models/user.js';

export const canAccessProjectHistory = async (userId, project) => {
  const user = await User.findById(userId).select('role');
  if (!user) return false;
  if (['admin', 'super_admin'].includes(user.role)) return true;
  return project?.projectHead?.toString() === userId;
};

export const getProjectDateChanges = async (projectId) => {
  const project = await Project.findById(projectId).select('title projectHead metrics');
  if (!project) return null;
  const history = await ProjectHistory.find({
    projectId,
    eventType: { $in: ['start_date_changed', 'end_date_changed'] }
  })
    .sort({ timestamp: -1 })
    .populate('actor', 'name email')
    .lean();

  const dateChanges = history.map(h => {
    const field = h.changes?.field || '';
    const oldValue = h.changes?.oldValue || null;
    const newValue = h.changes?.newValue || null;
    let delayDays = 0;
    if (field === 'endDate' && oldValue && newValue) {
      const o = new Date(oldValue);
      const n = new Date(newValue);
      const diff = n.getTime() - o.getTime();
      delayDays = diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
    }
    return {
      field,
      oldValue,
      newValue,
      changedBy: h.actor,
      changedAt: h.timestamp,
      reason: h.metadata?.reason || '',
      delayDays
    };
  });

  const totalExtensions = dateChanges.filter(dc => dc.field === 'endDate' && dc.delayDays > 0).length;
  const totalDelayDays = dateChanges.reduce((sum, dc) => sum + (dc.field === 'endDate' ? dc.delayDays : 0), 0);

  return {
    projectId,
    projectTitle: project.title,
    dateChanges,
    summary: {
      totalExtensions,
      totalDelayDays
    }
  };
};

