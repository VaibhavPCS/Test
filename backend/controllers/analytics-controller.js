// backend/controllers/analytics-controller.js

import Task from "../models/task.js";
import Project from "../models/project.js";
import User from "../models/user.js";
import Workspace from "../models/workspace.js";
import WorkspaceSummary from "../models/workspace-summary.js";
import ProjectLeaderboard from "../models/project-leaderboard.js";
import mongoose from "mongoose";

const getProjectAnalytics = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.userId;
    const { startDate, endDate } = req.query;

    // ✅ FIX: Handle "all" projects case
    if (projectId === 'all') {
      return getAllProjectsAnalytics(req, res);
    }

    // ✅ Validate ObjectId before querying
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid project ID format',
      });
    }

    // Get project with workspace populated
    const project = await Project.findById(projectId).populate("workspace");

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const user = await User.findById(userId);

    // Check access permissions
    const isSystemAdmin = user.role === "admin";
    const userWorkspace = user.workspaces.find(
      (w) => w.workspaceId.toString() === project.workspace._id.toString()
    );
    const hasWorkspaceAccess = !!userWorkspace;
    const workspaceRole = userWorkspace?.role;
    const isProjectLead =
      project.projectHead && project.projectHead.toString() === userId;
    const isProjectMember = project.members?.some(
      (member) => member.userId && member.userId.toString() === userId
    );
    const hasAssignedTask = await Task.exists({
      project: projectId,
      assignee: userId,
      isActive: true,
    });

    if (
      !isSystemAdmin &&
      !hasWorkspaceAccess &&
      !isProjectLead &&
      !isProjectMember &&
      !hasAssignedTask
    ) {
      return res.status(403).json({ message: "Access denied to this project" });
    }

    let dateFilter = {};
    let velocityStartDate = null;
    let velocityEndDate = null;

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      velocityStartDate = start;
      velocityEndDate = end;

      dateFilter.$or = [
        { startDate: { $gte: start, $lte: end } },
        { dueDate: { $gte: start, $lte: end } },
        { startDate: { $lte: end }, dueDate: { $gte: start } },
      ];
    }

    const tasks = await Task.find({
      project: projectId,
      isActive: true,
      ...dateFilter,
    }).populate("assignee", "name email");

    if (tasks.length === 0) {
      return res.status(200).json({
        message: "No data available",
        analytics: null,
        project: {
          _id: project._id,
          title: project.title,
          categories: project.categories?.map((cat) => cat.name) || [],
        },
      });
    }

    const tasksByCategory = {};
    if (project.categories && project.categories.length > 0) {
      project.categories.forEach((category) => {
        tasksByCategory[category.name] = tasks.filter(
          (task) => task.category === category.name
        );
      });
    }

    const categoryAnalytics = {};
    if (project.categories && project.categories.length > 0) {
      project.categories.forEach((category) => {
        const categoryTasks = tasksByCategory[category.name] || [];
        categoryAnalytics[category.name] = calculateCategoryAnalytics(
          categoryTasks,
          velocityStartDate,
          velocityEndDate
        );
      });
    }

    const overallAnalytics = calculateCategoryAnalytics(
      tasks,
      velocityStartDate,
      velocityEndDate
    );

    res.status(200).json({
      analytics: {
        overall: overallAnalytics,
        categories: categoryAnalytics,
      },
      project: {
        _id: project._id,
        title: project.title,
        categories: project.categories?.map((cat) => cat.name) || [],
      },
      totalTasks: tasks.length,
    });
  } catch (error) {
    console.error("Get project analytics error:", error);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

// ✅ NEW: Function to handle "All Projects" analytics
const getAllProjectsAnalytics = async (req, res) => {
  try {
    const userId = req.userId;
    const { startDate, endDate } = req.query;

    const user = await User.findById(userId);
    
    // Get workspace ID from header or user's current workspace
    const workspaceId = req.headers['workspace-id'] || user.currentWorkspace?._id;

    if (!workspaceId) {
      return res.status(400).json({
        message: 'No workspace context. Please select a workspace.',
      });
    }

    // Check workspace access
    const userWorkspace = user.workspaces.find(
      (w) => w.workspaceId.toString() === workspaceId.toString()
    );

    if (!userWorkspace) {
      return res.status(403).json({
        message: 'Access denied to this workspace',
      });
    }

    // Get all projects in the workspace
    const projects = await Project.find({ 
      workspace: workspaceId,
      isActive: true 
    });

    if (projects.length === 0) {
      return res.status(200).json({
        message: "No projects available in this workspace",
        analytics: null,
        project: {
          _id: 'all',
          title: 'All Projects',
        },
        totalTasks: 0,
      });
    }

    const projectIds = projects.map(p => p._id);

    let dateFilter = {};
    let velocityStartDate = null;
    let velocityEndDate = null;

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      velocityStartDate = start;
      velocityEndDate = end;

      dateFilter.$or = [
        { startDate: { $gte: start, $lte: end } },
        { dueDate: { $gte: start, $lte: end } },
        { startDate: { $lte: end }, dueDate: { $gte: start } },
      ];
    }

    // Aggregate tasks across all projects
    const tasks = await Task.find({
      project: { $in: projectIds },
      isActive: true,
      ...dateFilter,
    }).populate("assignee", "name email");

    if (tasks.length === 0) {
      return res.status(200).json({
        message: "No data available",
        analytics: null,
        project: {
          _id: 'all',
          title: 'All Projects',
        },
        totalTasks: 0,
      });
    }

    // Calculate overall analytics for all projects
    const overallAnalytics = calculateCategoryAnalytics(
      tasks,
      velocityStartDate,
      velocityEndDate
    );

    res.status(200).json({
      analytics: {
        overall: overallAnalytics,
        categories: {}, // No category breakdown for "all projects"
      },
      project: {
        _id: 'all',
        title: 'All Projects',
        workspace: workspaceId,
      },
      totalTasks: tasks.length,
    });
  } catch (error) {
    console.error('Get all projects analytics error:', error);
    res.status(500).json({ 
      message: 'Internal Server Error', 
      error: error.message 
    });
  }
};

const calculateCategoryAnalytics = (
  tasks,
  velocityStartDate = null,
  velocityEndDate = null
) => {
  const now = new Date();

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === "done").length;
  const todoTasks = tasks.filter((task) => task.status === "to-do").length;
  const inProgressTasks = tasks.filter(
    (task) => task.status === "in-progress"
  ).length;
  const overdueTasks = tasks.filter(
    (task) =>
      task.dueDate && new Date(task.dueDate) < now && task.status !== "done"
  ).length;

  const completionRate =
    totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  let averageDuration = 0;
  if (completedTasks > 0) {
    const completedTasksWithDuration = tasks
      .filter(
        (task) => task.status === "done" && task.completedAt && task.createdAt
      )
      .map((task) => {
        const created = new Date(task.createdAt);
        const completed = new Date(task.completedAt);
        const duration = Math.max(
          0,
          (completed - created) / (1000 * 60 * 60 * 24)
        );
        return duration;
      });

    if (completedTasksWithDuration.length > 0) {
      averageDuration =
        completedTasksWithDuration.reduce(
          (sum, duration) => sum + duration,
          0
        ) / completedTasksWithDuration.length;
    }
  }

  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const weeklyVelocity = tasks.filter(
    (task) =>
      task.status === "done" &&
      task.completedAt &&
      new Date(task.completedAt) >= last7Days
  ).length;

  const monthlyVelocity = tasks.filter(
    (task) =>
      task.status === "done" &&
      task.completedAt &&
      new Date(task.completedAt) >= last30Days
  ).length;

  const timeSeriesStart = velocityStartDate || last30Days;
  const timeSeriesEnd = velocityEndDate || now;

  const velocityTimeSeries = calculateVelocityTimeSeries(
    tasks,
    timeSeriesStart,
    timeSeriesEnd
  );

  const overduePercentage =
    totalTasks > 0 ? (overdueTasks / totalTasks) * 100 : 0;

  const statusDistribution = {
    "to-do": todoTasks,
    "in-progress": inProgressTasks,
    done: completedTasks,
  };

  const priorityDistribution = {
    low: tasks.filter((task) => task.priority === "low").length,
    medium: tasks.filter((task) => task.priority === "medium").length,
    high: tasks.filter((task) => task.priority === "high").length,
    urgent: tasks.filter((task) => task.priority === "urgent").length,
  };

  const completionTimeByPriority = {};
  ["low", "medium", "high", "urgent"].forEach((priority) => {
    const priorityCompletedTasks = tasks.filter(
      (task) =>
        task.priority === priority &&
        task.status === "done" &&
        task.completedAt &&
        task.createdAt
    );

    if (priorityCompletedTasks.length > 0) {
      const avgTime =
        priorityCompletedTasks
          .map((task) => {
            const created = new Date(task.createdAt);
            const completed = new Date(task.completedAt);
            return Math.max(0, (completed - created) / (1000 * 60 * 60 * 24));
          })
          .reduce((sum, duration) => sum + duration, 0) /
        priorityCompletedTasks.length;

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
      monthly: monthlyVelocity,
      timeSeries: velocityTimeSeries,
    },
    overdueTasks,
    overduePercentage: Math.round(overduePercentage * 100) / 100,
    statusDistribution,
    priorityDistribution,
    completionTimeByPriority,
  };
};

const calculateVelocityTimeSeries = (tasks, startDate, endDate) => {
  const timeSeries = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    const dayStart = new Date(current);
    const dayEnd = new Date(current);
    dayEnd.setHours(23, 59, 59, 999);

    const tasksCreated = tasks.filter((task) => {
      const created = new Date(task.createdAt);
      return created >= dayStart && created <= dayEnd;
    }).length;

    const tasksCompleted = tasks.filter((task) => {
      if (!task.completedAt) return false;
      const completed = new Date(task.completedAt);
      return completed >= dayStart && completed <= dayEnd;
    }).length;

    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const localDateStr = `${year}-${month}-${day}`;

    timeSeries.push({
      date: localDateStr,
      tasksCreated,
      tasksCompleted,
    });

    current.setDate(current.getDate() + 1);
  }

  return timeSeries;
};

const calculateProjectStatus = (project, completionPercentage) => {
  const now = new Date();
  const dueDate = new Date(project.endDate);
  const startDate = new Date(project.startDate);

  if (project.status === "Completed" || completionPercentage === 100) {
    return "Completed";
  }

  const projectStatus = project.status;
  const validStatuses = ["On Track", "At Risk", "Off Track", "Completed"];
  
  if (validStatuses.includes(projectStatus)) {
    return projectStatus;
  }

  const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

  if (daysUntilDue < 0 && completionPercentage < 100) {
    return "Off Track";
  }

  const totalDuration = Math.ceil((dueDate - startDate) / (1000 * 60 * 60 * 24));
  const timeElapsed = totalDuration - daysUntilDue;
  const expectedCompletion = totalDuration > 0 ? (timeElapsed / totalDuration) * 100 : 0;

  if (completionPercentage < expectedCompletion * 0.5) {
    return "Off Track";
  }

  if (completionPercentage < expectedCompletion * 0.8) {
    return "At Risk";
  }

  return "On Track";
};

const getWorkspaceIntelligence = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.userId;

    const user = await User.findById(userId);
    const userWorkspace = user.workspaces.find(
      (w) => w.workspaceId._id.toString() === workspaceId
    );

    if (!userWorkspace) {
      return res
        .status(403)
        .json({ message: "Access denied to this workspace" });
    }

    const summary = await WorkspaceSummary.findOne({
      workspaceId: workspaceId,
    });

    if (!summary) {
      return res.status(404).json({
        message:
          "No intelligence data available for this workspace yet. Data will be available after the next aggregation.",
      });
    }

    res.status(200).json({
      workspaceId: summary.workspaceId,
      overallCompletionRate: summary.overallCompletionRate,
      activeProjects: summary.activeProjects,
      workloadDistribution: summary.workloadDistribution,
      lastUpdatedAt: summary.lastUpdatedAt,
    });
  } catch (error) {
    console.error("Get workspace intelligence error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getProjectLeaderboard = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId).populate("workspaces.workspaceId");

    const currentWorkspaceId =
      req.headers["workspace-id"] || user.currentWorkspace?._id;

    if (!currentWorkspaceId) {
      return res.status(400).json({
        message: "No workspace context. Please select a workspace.",
      });
    }

    const userWorkspace = user.workspaces.find(
      (w) => w.workspaceId._id.toString() === currentWorkspaceId.toString()
    );

    if (!userWorkspace) {
      return res.status(403).json({
        message: "Access denied. You are not a member of this workspace.",
      });
    }

    const workspaceRole = userWorkspace.role;

    const allProjects = await Project.find({
      workspace: currentWorkspaceId,
      isActive: true,
    })
      .populate("projectHead", "name email")
      .select("_id title projectHead members status startDate endDate totalTasks completedTasks progress");

    let accessibleProjectIds = [];

    if (workspaceRole === "owner" || workspaceRole === "admin") {
      accessibleProjectIds = allProjects.map((p) => p._id);
    } else if (workspaceRole === "lead") {
      accessibleProjectIds = allProjects
        .filter(
          (p) => p.projectHead && p.projectHead._id.toString() === userId.toString()
        )
        .map((p) => p._id);
    } else if (workspaceRole === "member") {
      const memberProjects = allProjects.filter((project) =>
        project.members?.some(
          (member) =>
            member.userId && member.userId.toString() === userId.toString()
        )
      );

      const tasksProjectIds = await Task.find({
        assignee: userId,
        isActive: true,
        project: { $in: allProjects.map((p) => p._id) },
      }).distinct("project");

      const memberProjectIds = memberProjects.map((p) => p._id.toString());
      const taskProjectIds = tasksProjectIds.map((id) => id.toString());
      accessibleProjectIds = [
        ...new Set([...memberProjectIds, ...taskProjectIds]),
      ];
    } else {
      return res.status(403).json({
        message: "Insufficient permissions to view leaderboard.",
      });
    }

    if (accessibleProjectIds.length === 0) {
      return res.status(200).json({
        leaderboard: [],
        totalProjects: 0,
        lastUpdated: null,
        workspaceRole: workspaceRole,
        message: "No projects accessible with your current role.",
      });
    }

    const leaderboard = allProjects
      .filter((project) =>
        accessibleProjectIds.some((id) => id.toString() === project._id.toString())
      )
      .map((project) => {
        const completionPercentage = project.progress !== undefined && project.progress !== null
          ? project.progress
          : project.totalTasks > 0
            ? Math.round((project.completedTasks / project.totalTasks) * 100)
            : 0;

        const status = project.status;

        return {
          _id: project._id,
          projectId: project._id.toString(),
          projectName: project.title,
          projectHead: {
            userId: project.projectHead?._id?.toString() || "",
            userName: project.projectHead?.name || "Unassigned",
          },
          status: status,
          completionPercentage: completionPercentage,
          dueDate: project.endDate,
          lastUpdatedAt: new Date(),
        };
      })
      .sort((a, b) => {
        if (a.completionPercentage !== b.completionPercentage) {
          return a.completionPercentage - b.completionPercentage;
        }
        return new Date(a.dueDate) - new Date(b.dueDate);
      });

    res.status(200).json({
      leaderboard: leaderboard,
      totalProjects: leaderboard.length,
      lastUpdated: new Date().toISOString(),
      workspaceRole: workspaceRole,
      workspaceId: currentWorkspaceId,
    });
  } catch (error) {
    console.error("Get project leaderboard error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const refreshAnalytics = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    res.status(202).json({
      message:
        "Analytics refresh queued. Data will be updated within a few minutes.",
      note: "The worker service will process this request on its next scheduled run.",
    });
  } catch (error) {
    console.error("Refresh analytics error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getUserProductivityStats = async (req, res) => {
  try {
    const { userId } = req.params;
    const authenticatedUserId = req.userId;

    if (userId !== authenticatedUserId.toString()) {
      return res.status(403).json({ 
        message: "Forbidden. You can only access your own productivity stats." 
      });
    }

    const now = new Date();
    
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    
    const next7Days = new Date(startOfToday);
    next7Days.setDate(next7Days.getDate() + 7);
    next7Days.setHours(23, 59, 59, 999);
    
    const last7DaysStart = new Date(now);
    last7DaysStart.setDate(last7DaysStart.getDate() - 7);
    last7DaysStart.setHours(0, 0, 0, 0);

    const activeProjects = await Project.find({
      isActive: true
    })
    .populate({
      path: 'workspace',
      match: { isArchived: false },
      select: '_id name isArchived'
    })
    .select('_id workspace')
    .lean();

    const accessibleProjectIds = activeProjects
      .filter(p => p.workspace !== null)
      .map(p => p._id);

    if (accessibleProjectIds.length === 0) {
      return res.status(200).json({
        openTaskCount: 0,
        tasksDueNext7Days: [],
        tasksCompletedLast7Days: 0
      });
    }

    const openTaskCount = await Task.countDocuments({
      assignee: userId,
      status: { $in: ['to-do', 'in-progress'] },
      isActive: true,
      project: { $in: accessibleProjectIds }
    });

    const tasksDueNext7Days = await Task.find({
      assignee: userId,
      dueDate: { 
        $gte: startOfToday,
        $lte: next7Days 
      },
      status: { $in: ['to-do', 'in-progress'] },
      isActive: true,
      project: { $in: accessibleProjectIds }
    })
    .select('_id title dueDate priority status project')
    .populate('project', 'title')
    .sort({ dueDate: 1 })
    .lean();

    const tasksCompletedLast7Days = await Task.countDocuments({
      assignee: userId,
      status: 'done',
      completedAt: { $gte: last7DaysStart },
      isActive: true,
      project: { $in: accessibleProjectIds }
    });

    const stats = {
      openTaskCount,
      tasksDueNext7Days: tasksDueNext7Days.map(task => ({
        _id: task._id,
        title: task.title,
        dueDate: task.dueDate,
        priority: task.priority,
        status: task.status,
        projectTitle: task.project?.title || 'No Project'
      })),
      tasksCompletedLast7Days
    };

    res.status(200).json(stats);

  } catch (error) {
    console.error("Get user productivity stats error:", error);
    res.status(500).json({ 
      message: "Internal Server Error", 
      error: error.message 
    });
  }
};

export {
  getProjectAnalytics,
  getAllProjectsAnalytics, // ✅ Export the new function
  getWorkspaceIntelligence,
  getProjectLeaderboard,
  refreshAnalytics,
  getUserProductivityStats
};
