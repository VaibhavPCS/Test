import mongoose from 'mongoose';
import { aggregateEmployeeMetrics } from '../services/employee-metrics.service.js';

export async function aggregateAllEmployees(mainDB, reportingDB) {
  const User = mainDB.model('User');
  const users = await User.find({}).select('_id').lean();
  const batchSize = 50;
  const now = new Date();
  const startDaily = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    await Promise.all(batch.map(u => aggregateEmployeeMetrics(mainDB, reportingDB, u._id, startDaily, now)));
  }

  const Task = mainDB.model('Task');
  const Project = mainDB.model('Project');
  const EmployeePerformanceSnapshot = reportingDB.model('EmployeePerformanceSnapshot');
  const allUserIds = users.map(u => u._id.toString());
  const recentTasks = await Task.find({ assignee: { $in: allUserIds }, updatedAt: { $gte: startDaily } }).select('project assignee').lean();
  const projectIds = [...new Set(recentTasks.map(t => t.project).filter(Boolean).map(id => id.toString()))];
  const projects = await Project.find({ _id: { $in: projectIds } }).select('_id workspace').lean();
  const projToWs = new Map(projects.map(p => [p._id.toString(), p.workspace?.toString?.() || p.workspace]));
  const wsMembers = new Map();
  for (const t of recentTasks) {
    const ws = projToWs.get(t.project?.toString?.() || t.project);
    if (!ws) continue;
    const set = wsMembers.get(ws) || new Set();
    set.add(t.assignee?.toString?.() || t.assignee);
    wsMembers.set(ws, set);
  }
  for (const [ws, membersSet] of wsMembers.entries()) {
    const memberIds = [...membersSet];
    const snapshots = await EmployeePerformanceSnapshot.find({ period: 'daily', userId: { $in: memberIds } }).select('userId metrics.productivityScore').lean();
    const sorted = snapshots.sort((a, b) => (b.metrics?.productivityScore || 0) - (a.metrics?.productivityScore || 0));
    const total = sorted.length;
    for (let i = 0; i < sorted.length; i++) {
      const rank = i + 1;
      const percentile = Math.round((rank / total) * 100);
      await EmployeePerformanceSnapshot.updateOne(
        { userId: sorted[i].userId, period: 'daily' },
        { $set: { rankings: { inWorkspace: ws, totalInWorkspace: total, percentile, rank } } }
      );
    }
  }
}
