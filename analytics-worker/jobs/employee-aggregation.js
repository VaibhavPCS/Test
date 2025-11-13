import mongoose from 'mongoose';
import { aggregateEmployeeMetrics } from '../services/employee-metrics.service.js';

export async function aggregateAllEmployees(mainDB, reportingDB) {
  console.log('==========================================');
  console.log('🔄 Starting employee aggregation...');
  console.log('==========================================');
  
  const User = mainDB.model('User');
  const Task = mainDB.model('Task');
  const Project = mainDB.model('Project');
  const EmployeePerformanceSnapshot = reportingDB.model('EmployeePerformanceSnapshot');
  
  const users = await User.find({}).select('_id firstName lastName workspaces').lean();
  
  console.log(`📊 Processing ${users.length} employees...`);
  
  if (users.length === 0) {
    console.log('⚠️  No users found to process');
    return;
  }
  
  const batchSize = 50;
  const now = new Date();
  const startDaily = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  let processed = 0;
  let errors = 0;
  
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (user) => {
      try {
        const userIdObj = new mongoose.Types.ObjectId(user._id);
        
        await aggregateEmployeeMetrics(mainDB, reportingDB, userIdObj, startDaily, now);
        
        const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User';
        
        let workspaceIdObj = null;
        if (user.workspaces && Array.isArray(user.workspaces) && user.workspaces.length > 0) {
          const wsId = user.workspaces[0];
          if (wsId) {
            try {
              const raw = typeof wsId === 'object' && wsId !== null ? (wsId._id || wsId.workspaceId || wsId.id || (wsId.toString && wsId.toString())) : wsId;
              workspaceIdObj = mongoose.Types.ObjectId.isValid(raw)
                ? (typeof raw === 'string' ? new mongoose.Types.ObjectId(raw) : raw)
                : null;
              if (!workspaceIdObj) console.warn(`Invalid workspaceId for user ${user._id}:`, String(raw));
            } catch (err) {
              console.warn(`Invalid workspaceId for user ${user._id}:`, err.message);
            }
          }
        }
        
        await EmployeePerformanceSnapshot.updateOne(
          { userId: userIdObj, period: 'daily' },
          { $set: { userName, workspaceId: workspaceIdObj } },
          { upsert: false }
        );
        
        processed++;
      } catch (error) {
        console.error(`❌ Error processing user ${user._id}:`, error.message);
        errors++;
      }
    }));
    
    console.log(`✅ Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(users.length / batchSize)}: Processed ${batch.length} users`);
  }

  console.log('📊 Calculating workspace rankings...');
  
  const allUserIds = users.map(u => new mongoose.Types.ObjectId(u._id));
  const recentTasks = await Task.find({ assignee: { $in: allUserIds }, updatedAt: { $gte: startDaily } }).select('project assignee').lean();
  
  const projectIds = [...new Set(recentTasks.map(t => t.project).filter(Boolean).map(id => new mongoose.Types.ObjectId(id)))];
  
  const projects = await Project.find({ _id: { $in: projectIds } }).select('_id workspace').lean();
  
  const projToWs = new Map();
  projects.forEach(p => {
    if (p._id && p.workspace) {
      projToWs.set(p._id.toString(), p.workspace.toString());
    }
  });
  
  const wsMembers = new Map();
  recentTasks.forEach(t => {
    if (!t.project || !t.assignee) return;
    
    const projectIdStr = t.project.toString();
    const ws = projToWs.get(projectIdStr);
    if (!ws) return;
    
    const assigneeStr = t.assignee.toString();
    const set = wsMembers.get(ws) || new Set();
    set.add(assigneeStr);
    wsMembers.set(ws, set);
  });
  
  for (const [ws, membersSet] of wsMembers.entries()) {
    const memberIds = Array.from(membersSet).map(id => new mongoose.Types.ObjectId(id));
    
    const snapshots = await EmployeePerformanceSnapshot.find({ period: 'daily', userId: { $in: memberIds } }).select('userId metrics.productivityScore').lean();
    
    const sorted = snapshots.sort((a, b) => (b.metrics?.productivityScore || 0) - (a.metrics?.productivityScore || 0));
    
    const total = sorted.length;
    
    for (let i = 0; i < sorted.length; i++) {
      const rank = i + 1;
      const percentile = Math.round((rank / total) * 100);
      
      await EmployeePerformanceSnapshot.updateOne(
        { userId: sorted[i].userId, period: 'daily' },
        { $set: { rankings: { totalInWorkspace: total, percentile, rank } } }
      );
    }
  }
  
  console.log('==========================================');
  console.log(`✅ Employee aggregation completed!`);
  console.log(`📊 Processed: ${processed} users`);
  console.log(`❌ Errors: ${errors} users`);
  console.log('==========================================');
}
