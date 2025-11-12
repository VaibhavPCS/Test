import Task from '../models/task.js';
import TaskHistory from '../models/task-history.js';
import User from '../models/user.js';

export const canAccessTaskLifecycle = async (userId, task) => {
  if (!task) return false;
  if (task.creator && task.creator.toString() === userId) return true;
  if (task.assignee && task.assignee.toString() === userId) return true;
  const project = task.project?._id ? task.project : task.project;
  if (project) {
    const head = task.project?.projectHead || null;
    if (head && head.toString() === userId) return true;
  }
  const user = await User.findById(userId);
  if (['admin', 'super_admin'].includes(user?.role)) return true;
  return false;
};

export const calculateLifecycleMetrics = (task, history) => {
  const createdAt = task.createdAt ? new Date(task.createdAt) : null;
  const startedAt = task.startedAt ? new Date(task.startedAt) : null;
  const completedAt = task.completedAt ? new Date(task.completedAt) : null;
  const toHours = (ms) => Math.round((ms / (1000 * 60 * 60)) * 100) / 100;
  const totalDuration = createdAt && completedAt ? toHours(completedAt - createdAt) : 0;
  const workingDuration = startedAt && completedAt ? toHours(completedAt - startedAt) : 0;
  const rejectionCount = history.filter(h => h.eventType === 'rejected').length;
  const approvalAttempts = history.filter(h => h.eventType === 'submitted_for_approval').length;
  const reassignments = history.filter(h => h.eventType === 'reassigned').length;
  return { totalDuration, workingDuration, rejectionCount, approvalAttempts, reassignments };
};

export const getTaskLifecycle = async (taskId, { page = 1, limit = 50 } = {}) => {
  const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
  const safePage = Math.max(parseInt(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const task = await Task.findById(taskId)
    .populate('creator', 'name email')
    .populate('assignee', 'name email')
    .populate('project', 'title projectHead');
  if (!task) return { task: null };

  const total = await TaskHistory.countDocuments({ taskId });
  const timeline = await TaskHistory.find({ taskId })
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(safeLimit)
    .populate('actor', 'name email')
    .lean();

  const metrics = calculateLifecycleMetrics(task.toObject ? task.toObject() : task, timeline);

  return {
    task: {
      _id: task._id,
      title: task.title,
    },
    timeline,
    metrics,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      hasMore: skip + safeLimit < total
    }
  };
};

