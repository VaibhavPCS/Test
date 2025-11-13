import mongoose from 'mongoose';
import { calculateTaskCounts, calculateApprovalMetrics, calculateTimeMetrics, calculateQualityMetrics, calculateProductivityScore } from '../utils/metrics-calculator.js';

export async function aggregateEmployeeMetrics(mainDB, reportingDB, userId, startDate, endDate) {
  const Task = mainDB.model('Task');
  const TaskHistory = mainDB.model('TaskHistory') || mainDB.model('TaskHistory', new mongoose.Schema({}, { strict: false }));
  const EmployeePerformanceSnapshot = reportingDB.model('EmployeePerformanceSnapshot');
  const User = mainDB.model('User');
  const Project = mainDB.model('Project');

  const userIdObj = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;

  const dateFilter = { $and: [] };
  if (startDate) dateFilter.$and.push({ updatedAt: { $gte: startDate } });
  if (endDate) dateFilter.$and.push({ updatedAt: { $lte: endDate } });
  if (dateFilter.$and.length === 0) delete dateFilter.$and;

  const tasks = await Task.find({ assignee: userIdObj, isActive: true, ...(dateFilter || {}) }).lean();

  const taskIds = tasks.map(t => t._id);
  const history = await TaskHistory.find({ taskId: { $in: taskIds } }).lean();

  const counts = calculateTaskCounts(tasks);
  const approvals = calculateApprovalMetrics(tasks, history);
  const times = calculateTimeMetrics(history);
  const quality = calculateQualityMetrics(tasks, history);
  const productivityScore = calculateProductivityScore({ ...counts, ...approvals, ...quality });

  const metrics = { ...counts, ...approvals, ...times, ...quality, productivityScore };

  const projects = await Project.find({ _id: { $in: tasks.map(t => t.project).filter(Boolean) } }).lean();

  const projectsArray = projects.map(p => {
    const ptasks = tasks.filter(t => t.project && t.project.toString() === p._id.toString());
    const assigned = ptasks.length;
    const completed = ptasks.filter(t => t.status === 'done').length;
    const pApprovalRate = approvals.approvalRate;
    
    return { projectId: p._id, projectName: p.title, role: 'member', tasksAssigned: assigned, tasksCompleted: completed, approvalRate: pApprovalRate };
  });

  const user = await User.findById(userIdObj).select('workspaces').lean();
  let workspaceIdObj = null;

  if (user && user.workspaces && Array.isArray(user.workspaces) && user.workspaces.length > 0) {
    const wsId = user.workspaces[0];
    if (wsId) {
      try {
        const raw = typeof wsId === 'object' && wsId !== null ? (wsId._id || wsId.workspaceId || wsId.id || (wsId.toString && wsId.toString())) : wsId;
        workspaceIdObj = mongoose.Types.ObjectId.isValid(raw)
          ? (typeof raw === 'string' ? new mongoose.Types.ObjectId(raw) : raw)
          : null;
        if (!workspaceIdObj) console.warn(`Invalid workspaceId for user ${userIdObj}:`, String(raw));
      } catch (err) {
        console.warn(`Invalid workspaceId for user ${userIdObj}:`, err.message);
      }
    }
  }

  const snapshotDate = new Date();
  const period = 'daily';

  await EmployeePerformanceSnapshot.updateOne(
    { userId: userIdObj, period, snapshotDate: { $lte: snapshotDate } },
    { $set: { userId: userIdObj, workspaceId: workspaceIdObj, period, snapshotDate, metrics, projects: projectsArray } },
    { upsert: true }
  );

  return { metrics, projects: projectsArray };
}
