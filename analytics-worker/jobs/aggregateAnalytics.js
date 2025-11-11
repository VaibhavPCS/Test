import mongoose from 'mongoose';

/**
 * Main aggregation logic for analytics data
 * Aggregates workspace summaries and project leaderboard data
 */
export async function aggregateAnalytics(mainDB, reportingDB) {
  console.log('📊 Starting analytics aggregation...');
  
  try {
    const Workspace = mainDB.model('Workspace');
    const WorkspaceSummary = reportingDB.model('WorkspaceSummary');
    const ProjectLeaderboard = reportingDB.model('ProjectLeaderboard');
    
    // Get all NON-ARCHIVED workspaces
    const workspaces = await Workspace.find({ isArchived: false });
    console.log(`📋 Found ${workspaces.length} active workspaces`);
    
    // Aggregate workspace intelligence
    for (const workspace of workspaces) {
      await aggregateWorkspaceIntelligence(workspace, mainDB, reportingDB);
    }
    
    // Aggregate project leaderboard
    await aggregateProjectLeaderboard(mainDB, reportingDB);
    
    console.log('✅ Analytics aggregation completed successfully');
  } catch (error) {
    console.error('❌ Error during aggregation:', error);
    throw error;
  }
}

/**
 * Aggregates intelligence data for a single workspace
 */
async function aggregateWorkspaceIntelligence(workspace, mainDB, reportingDB) {
  const workspaceId = workspace._id;
  console.log(`  📊 Aggregating workspace: ${workspace.name || workspaceId}`);
  
  try {
    const Project = mainDB.model('Project');
    const Task = mainDB.model('Task');
    const User = mainDB.model('User');
    const WorkspaceSummary = reportingDB.model('WorkspaceSummary');
    
    const projects = await Project.find({ 
      workspace: workspaceId,
      isActive: true 
    }).populate('projectHead', 'name email');
    
    if (projects.length === 0) {
      console.log(`    ⚠️  No active projects found for workspace ${workspaceId}`);
      return;
    }
    
    const projectIds = projects.map(p => p._id);
    const allTasks = await Task.find({ 
      project: { $in: projectIds },
      isActive: true 
    });
    
    console.log(`    📝 Found ${allTasks.length} active tasks across ${projects.length} projects`);
    
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(task => task.status === 'done').length;
    const overallCompletionRate = totalTasks > 0 
      ? Math.round((completedTasks / totalTasks) * 100) 
      : 0;
    
    const activeProjects = projects.map(project => ({
      projectId: project._id,
      projectName: project.title
    }));
    
    const openTasks = allTasks.filter(
      task => task.status === 'to-do' || task.status === 'in-progress'
    );
    
    console.log(`    📊 Open tasks: ${openTasks.length} (to-do + in-progress)`);
    
    const tasksByUser = {};
    for (const task of openTasks) {
      if (task.assignee) {
        const userId = task.assignee.toString();
        if (!tasksByUser[userId]) {
          tasksByUser[userId] = 0;
        }
        tasksByUser[userId]++;
      }
    }
    
    const userIds = Object.keys(tasksByUser);
    
    if (userIds.length === 0) {
      console.log(`    ⚠️  No assigned tasks found (all tasks unassigned or completed)`);
      await WorkspaceSummary.updateOne(
        { workspaceId: workspaceId },
        {
          $set: {
            workspaceId: workspaceId,
            overallCompletionRate: overallCompletionRate,
            activeProjects: activeProjects,
            workloadDistribution: [],
            lastUpdatedAt: new Date()
          }
        },
        { upsert: true }
      );
      console.log(`    ✅ Workspace aggregated: ${overallCompletionRate}% complete, ${projects.length} projects, 0 users with assigned tasks`);
      return;
    }
    
    const users = await User.find({ _id: { $in: userIds } });
    
    const workloadDistribution = users.map(user => ({
      userId: user._id,
      userName: user.name || user.email || 'Unknown',
      openTaskCount: tasksByUser[user._id.toString()] || 0
    }));
    
    workloadDistribution.sort((a, b) => b.openTaskCount - a.openTaskCount);
    
    await WorkspaceSummary.updateOne(
      { workspaceId: workspaceId },
      {
        $set: {
          workspaceId: workspaceId,
          overallCompletionRate: overallCompletionRate,
          activeProjects: activeProjects,
          workloadDistribution: workloadDistribution,
          lastUpdatedAt: new Date()
        }
      },
      { upsert: true }
    );
    
    console.log(`    ✅ Workspace aggregated: ${overallCompletionRate}% complete, ${projects.length} projects, ${workloadDistribution.length} users with tasks`);
    
  } catch (error) {
    console.error(`    ❌ Error aggregating workspace ${workspaceId}:`, error.message);
    throw error;
  }
}

/**
 * Aggregates project leaderboard data for all active projects
 */
async function aggregateProjectLeaderboard(mainDB, reportingDB) {
  console.log('\n📊 Aggregating Project Leaderboard...');
  
  try {
    const Workspace = mainDB.model('Workspace');
    const Project = mainDB.model('Project');
    const Task = mainDB.model('Task');
    const ProjectLeaderboard = reportingDB.model('ProjectLeaderboard');
    
    // Get all NON-ARCHIVED workspaces
    const activeWorkspaces = await Workspace.find({ isArchived: false });
    const activeWorkspaceIds = activeWorkspaces.map(w => w._id);
    
    console.log(`  📋 Found ${activeWorkspaces.length} non-archived workspaces`);
    
    // Get all ACTIVE projects ONLY from NON-ARCHIVED workspaces
    const projects = await Project.find({ 
      isActive: true,
      workspace: { $in: activeWorkspaceIds }  // ← FIX: Only from active workspaces
    }).populate('projectHead', 'name email');
    
    console.log(`  📋 Found ${projects.length} active projects for leaderboard`);
    
    if (projects.length === 0) {
      console.log(`  ⚠️  No active projects found`);
      return;
    }
    
    for (const project of projects) {
      const tasks = await Task.find({ 
        project: project._id,
        isActive: true 
      });
      
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(task => task.status === 'done').length;
      const completionPercentage = totalTasks > 0 
        ? Math.round((completedTasks / totalTasks) * 100) 
        : 0;
      
      const status = calculateProjectStatus(completionPercentage, project.endDate);
      
      const projectHead = {
        userId: project.projectHead?._id || project.projectHead,
        userName: project.projectHead?.name || project.projectHead?.email || 'Unknown'
      };
      
      await ProjectLeaderboard.updateOne(
        { projectId: project._id },
        {
          $set: {
            projectId: project._id,
            projectName: project.title,
            projectHead: projectHead,
            status: status,
            completionPercentage: completionPercentage,
            dueDate: project.endDate,
            lastUpdatedAt: new Date()
          }
        },
        { upsert: true }
      );
      
      console.log(`    ✅ ${project.title}: ${completionPercentage}% complete, Status: ${status}`);
    }
    
    console.log(`  ✅ Project leaderboard aggregation complete\n`);
    
  } catch (error) {
    console.error(`  ❌ Error aggregating project leaderboard:`, error.message);
    throw error;
  }
}


/**
 * Calculate project status based on completion percentage and due date
 */
function calculateProjectStatus(completionPercentage, dueDate) {
  const now = new Date();
  const due = new Date(dueDate);
  const daysUntilDue = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  
  if (completionPercentage === 100) {
    return 'Completed';
  }
  
  if (daysUntilDue < 0) {
    return 'Off Track';
  }
  
  if (completionPercentage > 50 || daysUntilDue > 7) {
    return 'On Track';
  }
  
  if (completionPercentage >= 25 && daysUntilDue <= 7) {
    return 'At Risk';
  }
  
  return 'Off Track';
}
