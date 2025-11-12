import mongoose from 'mongoose';
import { calculateTaskCounts, calculateApprovalMetrics, calculateTimeMetrics, calculateQualityMetrics, calculateProductivityScore } from '../utils/metrics-calculator.js';

export async function aggregateEmployeeMetrics(mainDB, reportingDB, userId, startDate, endDate) {
  const Task = mainDB.model('Task');
  const TaskHistory = mainDB.model('TaskHistory') || mainDB.model('TaskHistory', new mongoose.Schema({},{strict:false}));
  const EmployeePerformanceSnapshot = reportingDB.model('EmployeePerformanceSnapshot');

  const dateFilter = { $and: [] };
  if (startDate) dateFilter.$and.push({ updatedAt: { $gte: startDate } });
  if (endDate) dateFilter.$and.push({ updatedAt: { $lte: endDate } });
  if (dateFilter.$and.length === 0) delete dateFilter.$and;

  const tasks = await Task.find({ assignee: userId, isActive: true, ...(dateFilter || {}) }).lean();
  const taskIds = tasks.map(t => t._id);
  const history = await TaskHistory.find({ taskId: { $in: taskIds } }).lean();

  const counts = calculateTaskCounts(tasks);
  const approvals = calculateApprovalMetrics(tasks, history);
  const times = calculateTimeMetrics(history);
  const quality = calculateQualityMetrics(tasks, history);
  const productivityScore = calculateProductivityScore({ ...counts, ...approvals, ...quality });

  const metrics = { ...counts, ...approvals, ...times, ...quality, productivityScore };

  // Projects involvement (basic version)
  const Project = mainDB.model('Project');
  const TaskModel = Task; // alias
  const projects = await Project.find({ _id: { $in: tasks.map(t => t.project) } }).lean();
  const projectsArray = projects.map(p => {
    const ptasks = tasks.filter(t => String(t.project) === String(p._id));
    const assigned = ptasks.length;
    const completed = ptasks.filter(t => t.status === 'done').length;
    const pApprovalRate = approvals.approvalRate;
    return { projectId: p._id, projectName: p.title, role: 'member', tasksAssigned: assigned, tasksCompleted: completed, approvalRate: pApprovalRate };
  });

  const snapshotDate = new Date();
  const period = 'daily';

  await EmployeePerformanceSnapshot.updateOne(
    { userId, period, snapshotDate: { $lte: snapshotDate } },
    {
      $set: {
        userId,
        period,
        snapshotDate,
        metrics,
        projects: projectsArray,
      }
    },
    { upsert: true }
  );

  return { metrics, projects: projectsArray };
}

