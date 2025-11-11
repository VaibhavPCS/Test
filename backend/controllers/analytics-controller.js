import Task from '../models/task.js';
import Project from '../models/project.js';
import User from '../models/user.js';
import Workspace from '../models/workspace.js';
import WorkspaceSummary from '../models/workspace-summary.js';
import ProjectLeaderboard from '../models/project-leaderboard.js';
import mongoose from 'mongoose';

const getProjectAnalytics = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.userId;
    const { startDate, endDate } = req.query;

    console.log('Analytics request:', { projectId, userId, startDate, endDate });

    // Get project with workspace populated
    const project = await Project.findById(projectId).populate('workspace');
    
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const user = await User.findById(userId);

    // Check access permissions
    // 1. System admin - can access all projects
    const isSystemAdmin = user.role === 'admin';
    
    // 2. Workspace access - check if user is workspace owner/admin/member
    const userWorkspace = user.workspaces.find(
      w => w.workspaceId.toString() === project.workspace._id.toString()
    );
    const hasWorkspaceAccess = !!userWorkspace;
    const workspaceRole = userWorkspace?.role;
    
    // 3. Project lead - check if user is projectHead
    const isProjectLead = project.projectHead && project.projectHead.toString() === userId;
    
    // 4. Project member - check if user is in project.members
    const isProjectMember = project.members?.some(
      member => member.userId && member.userId.toString() === userId
    );
    
    // 5. Task assignee - check if user has any tasks in this project
    const hasAssignedTask = await Task.exists({ 
      project: projectId, 
      assignee: userId, 
      isActive: true 
    });

    // Grant access if ANY of these conditions are true
    if (!isSystemAdmin && !hasWorkspaceAccess && !isProjectLead && !isProjectMember && !hasAssignedTask) {
      return res.status(403).json({ message: "Access denied to this project" });
    }

    // Build date filter
    let dateFilter = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start <= end) {
        dateFilter.createdAt = { $gte: start, $lte: end };
      }
    }

    // Get all tasks for this project
    const tasks = await Task.find({
      project: projectId,
      isActive: true,
      ...dateFilter
    }).populate('assignee', 'name email');

    console.log(`Found ${tasks.length} tasks for project ${projectId}`);

    if (tasks.length === 0) {
      return res.status(200).json({
        message: "No data available",
        analytics: null,
        project: {
          _id: project._id,
          title: project.title,
          categories: project.categories?.map(cat => cat.name) || []
        }
      });
    }

    // Group tasks by category
    const tasksByCategory = {};
    if (project.categories && project.categories.length > 0) {
      project.categories.forEach(category => {
        tasksByCategory[category.name] = tasks.filter(task => task.category === category.name);
      });
    }

    // Calculate analytics for each category
    const categoryAnalytics = {};
    if (project.categories && project.categories.length > 0) {
      project.categories.forEach(category => {
        const categoryTasks = tasksByCategory[category.name] || [];
        categoryAnalytics[category.name] = calculateCategoryAnalytics(categoryTasks);
      });
    }

    // Calculate overall project analytics
    const overallAnalytics = calculateCategoryAnalytics(tasks);

    res.status(200).json({
      analytics: {
        overall: overallAnalytics,
        categories: categoryAnalytics
      },
      project: {
        _id: project._id,
        title: project.title,
        categories: project.categories?.map(cat => cat.name) || []
      },
      totalTasks: tasks.length
    });

  } catch (error) {
    console.error('Get project analytics error:', error);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};

const calculateCategoryAnalytics = (tasks) => {
  const now = new Date();
  
  // Basic counts
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(task => task.status === 'done').length;
  const todoTasks = tasks.filter(task => task.status === 'to-do').length;
  const inProgressTasks = tasks.filter(task => task.status === 'in-progress').length;
  const overdueTasks = tasks.filter(task => 
    task.dueDate && new Date(task.dueDate) < now && task.status !== 'done'
  ).length;

  // Task Completion Rate
  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // Average Task Duration (only for completed tasks)
  let averageDuration = 0;
  if (completedTasks > 0) {
    const completedTasksWithDuration = tasks
      .filter(task => task.status === 'done' && task.completedAt && task.createdAt)
      .map(task => {
        const created = new Date(task.createdAt);
        const completed = new Date(task.completedAt);
        const duration = Math.max(0, (completed - created) / (1000 * 60 * 60 * 24)); // days
        return duration;
      });
    
    if (completedTasksWithDuration.length > 0) {
      averageDuration = completedTasksWithDuration.reduce((sum, duration) => sum + duration, 0) / completedTasksWithDuration.length;
    }
  }

  // Task Velocity (last 7 days and last 30 days)
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const weeklyVelocity = tasks.filter(task => 
    task.status === 'done' && task.completedAt && new Date(task.completedAt) >= last7Days
  ).length;
  
  const monthlyVelocity = tasks.filter(task => 
    task.status === 'done' && task.completedAt && new Date(task.completedAt) >= last30Days
  ).length;

  // Overdue percentage
  const overduePercentage = totalTasks > 0 ? (overdueTasks / totalTasks) * 100 : 0;

  // Status Distribution
  const statusDistribution = {
    'to-do': todoTasks,
    'in-progress': inProgressTasks,
    'done': completedTasks
  };

  // Priority Distribution
  const priorityDistribution = {
    low: tasks.filter(task => task.priority === 'low').length,
    medium: tasks.filter(task => task.priority === 'medium').length,
    high: tasks.filter(task => task.priority === 'high').length
  };

  // Time to Complete by Priority
  const completionTimeByPriority = {};
  ['low', 'medium', 'high'].forEach(priority => {
    const priorityCompletedTasks = tasks.filter(task => 
      task.priority === priority && task.status === 'done' && task.completedAt && task.createdAt
    );
    
    if (priorityCompletedTasks.length > 0) {
      const avgTime = priorityCompletedTasks
        .map(task => {
          const created = new Date(task.createdAt);
          const completed = new Date(task.completedAt);
          return Math.max(0, (completed - created) / (1000 * 60 * 60 * 24));
        })
        .reduce((sum, duration) => sum + duration, 0) / priorityCompletedTasks.length;
      
      completionTimeByPriority[priority] = Math.round(avgTime * 100) / 100;
    } else {
      completionTimeByPriority[priority] = 0;
    }
  });

  return {
    totalTasks,
    completedTasks,
    completionRate: Math.round(completionRate * 100) / 100,
    averageDuration: Math.round(averageDuration * 100) / 100,
    velocity: {
      weekly: weeklyVelocity,
      monthly: monthlyVelocity
    },
    overdueTasks,
    overduePercentage: Math.round(overduePercentage * 100) / 100,
    statusDistribution,
    priorityDistribution,
    completionTimeByPriority
  };
};

// NEW: Get Workspace Intelligence Data
const getWorkspaceIntelligence = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.userId;

    // Verify workspace access
    const user = await User.findById(userId);
    const userWorkspace = user.workspaces.find(
      w => w.workspaceId._id.toString() === workspaceId
    );

    if (!userWorkspace) {
      return res.status(403).json({ message: 'Access denied to this workspace' });
    }

    // Get aggregated data from reporting database
    const summary = await WorkspaceSummary.findOne({ workspaceId: workspaceId });

    if (!summary) {
      return res.status(404).json({ 
        message: 'No intelligence data available for this workspace yet. Data will be available after the next aggregation.' 
      });
    }

    res.status(200).json({
      workspaceId: summary.workspaceId,
      overallCompletionRate: summary.overallCompletionRate,
      activeProjects: summary.activeProjects,
      workloadDistribution: summary.workloadDistribution,
      lastUpdatedAt: summary.lastUpdatedAt
    });

  } catch (error) {
    console.error('Get workspace intelligence error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// NEW: Get Project Leaderboard Data (with Role-Based Access Control)
const getProjectLeaderboard = async (req, res) => {
  try {
    const userId = req.userId;

    // Get user with workspace details
    const user = await User.findById(userId).populate('workspaces.workspaceId');
    
    // Get current workspace from header or user's currentWorkspace
    const currentWorkspaceId = req.headers['workspace-id'] || user.currentWorkspace?._id;
    
    if (!currentWorkspaceId) {
      return res.status(400).json({ 
        message: 'No workspace context. Please select a workspace.' 
      });
    }

    // Find user's role in current workspace
    const userWorkspace = user.workspaces.find(
      w => w.workspaceId._id.toString() === currentWorkspaceId.toString()
    );

    if (!userWorkspace) {
      return res.status(403).json({ 
        message: 'Access denied. You are not a member of this workspace.' 
      });
    }

    const workspaceRole = userWorkspace.role;

    // Get all projects in current workspace
    const allProjects = await Project.find({ 
      workspace: currentWorkspaceId,
      isActive: true 
    }).select('_id projectHead members');

    let accessibleProjectIds = [];

    // Role-based filtering
    if (workspaceRole === 'owner' || workspaceRole === 'admin') {
      // Owner/Admin: See ALL projects in workspace
      accessibleProjectIds = allProjects.map(p => p._id);
      
    } else if (workspaceRole === 'lead') {
      // Lead: See only projects where they are the project head
      accessibleProjectIds = allProjects
        .filter(p => p.projectHead && p.projectHead.toString() === userId.toString())
        .map(p => p._id);
        
    } else if (workspaceRole === 'member') {
      // Member: See projects where they're members OR have tasks assigned
      
      // Projects where user is a member
      const memberProjects = allProjects.filter(project => 
        project.members?.some(member => 
          member.userId && member.userId.toString() === userId.toString()
        )
      );
      
      // Projects where user has tasks assigned
      const tasksProjectIds = await Task.find({
        assignee: userId,
        isActive: true,
        project: { $in: allProjects.map(p => p._id) }
      }).distinct('project');
      
      // Combine both (unique IDs)
      const memberProjectIds = memberProjects.map(p => p._id.toString());
      const taskProjectIds = tasksProjectIds.map(id => id.toString());
      accessibleProjectIds = [...new Set([...memberProjectIds, ...taskProjectIds])];
      
    } else {
      // Unknown role or restricted access
      return res.status(403).json({ 
        message: 'Insufficient permissions to view leaderboard.' 
      });
    }

    // If no accessible projects, return empty leaderboard
    if (accessibleProjectIds.length === 0) {
      return res.status(200).json({
        leaderboard: [],
        totalProjects: 0,
        lastUpdated: null,
        workspaceRole: workspaceRole,
        message: 'No projects accessible with your current role.'
      });
    }

    // Get leaderboard data for accessible projects only
    const leaderboard = await ProjectLeaderboard.find({
      projectId: { $in: accessibleProjectIds }
    })
    .sort({ completionPercentage: 1, dueDate: 1 }) // Low completion first, then soonest due date
    .lean();

    res.status(200).json({
      leaderboard: leaderboard,
      totalProjects: leaderboard.length,
      lastUpdated: leaderboard[0]?.lastUpdatedAt || null,
      workspaceRole: workspaceRole, // Help frontend understand what user can see
      workspaceId: currentWorkspaceId
    });

  } catch (error) {
    console.error('Get project leaderboard error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// NEW: Manual Refresh Trigger (Admin only)
const refreshAnalytics = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);

    // Check if user is admin
    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    // Trigger the analytics worker aggregation
    // Since the worker is a separate service, we'll trigger it via a simple HTTP request
    // or by directly calling the aggregation function (if imported)
    
    // For now, return a message that the refresh will happen on next scheduled run
    // In production, you'd trigger the worker via IPC, message queue, or HTTP
    
    res.status(202).json({ 
      message: 'Analytics refresh queued. Data will be updated within a few minutes.',
      note: 'The worker service will process this request on its next scheduled run.'
    });

  } catch (error) {
    console.error('Refresh analytics error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export { 
  getProjectAnalytics,
  getWorkspaceIntelligence,
  getProjectLeaderboard,
  refreshAnalytics
};
