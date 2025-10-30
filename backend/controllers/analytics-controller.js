import Task from '../models/task.js';
import Project from '../models/project.js';
import User from '../models/user.js';
import Workspace from '../models/workspace.js';

const getProjectAnalytics = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.userId;
    const { startDate, endDate } = req.query;

    console.log('Analytics request:', { projectId, userId, startDate, endDate });

    // Verify project access
    const project = await Project.findById(projectId).populate('workspace');
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check user access to project
    const user = await User.findById(userId);
    if (user.currentWorkspace?.toString() !== project.workspace._id.toString()) {
      return res.status(403).json({ message: "Access denied to this project" });
    }

    // Check if user is member of the project or has workspace access
    const workspace = await Workspace.findById(project.workspace._id);
    const userWorkspaceMember = workspace.members.find(
      member => member.userId.toString() === userId
    );

    if (!userWorkspaceMember) {
      return res.status(403).json({ message: "Access denied to this workspace" });
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
          categories: project.categories.map(cat => cat.name)
        }
      });
    }

    // Group tasks by category
    const tasksByCategory = {};
    project.categories.forEach(category => {
      tasksByCategory[category.name] = tasks.filter(task => task.category === category.name);
    });

    // Calculate analytics for each category
    const categoryAnalytics = {};
    project.categories.forEach(category => {
      const categoryTasks = tasksByCategory[category.name] || [];
      categoryAnalytics[category.name] = calculateCategoryAnalytics(categoryTasks);
    });

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
        categories: project.categories.map(cat => cat.name)
      },
      totalTasks: tasks.length
    });

  } catch (error) {
    console.error('Get project analytics error:', error);
    res.status(500).json({ message: "Internal Server Error" });
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
      
      completionTimeByPriority[priority] = avgTime;
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

export { getProjectAnalytics };
