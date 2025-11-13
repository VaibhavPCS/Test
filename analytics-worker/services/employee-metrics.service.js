import mongoose from "mongoose";
import {
  calculateTaskCounts,
  calculateApprovalMetrics,
  calculateTimeMetrics,
  calculateQualityMetrics,
  calculateProductivityScore,
} from "../utils/metrics-calculator.js";

export async function aggregateEmployeeMetrics(
  mainDB,
  reportingDB,
  userId,
  startDate,
  endDate
) {
  const Task = mainDB.model("Task");
  const TaskHistory =
    mainDB.model("TaskHistory") ||
    mainDB.model("TaskHistory", new mongoose.Schema({}, { strict: false }));
  const EmployeePerformanceSnapshot = reportingDB.model(
    "EmployeePerformanceSnapshot"
  );
  const User = mainDB.model("User");
  const Project = mainDB.model("Project");

  const userIdObj = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId)
    : userId;

  // ✅ FIX: Better date filtering for tasks active during the period
  const dateFilter = {
    $or: [
      { createdAt: { $gte: startDate, $lte: endDate } },
      { updatedAt: { $gte: startDate, $lte: endDate } },
      { completedAt: { $gte: startDate, $lte: endDate } },
    ],
  };

  // ✅ CORRECT: Fetch tasks assigned to this specific user
  const tasks = await Task.find({
    assignee: userIdObj,
    isActive: true,
    ...dateFilter,
  }).lean();

  const taskIds = tasks.map((t) => t._id);
  
  // ✅ FIX: Filter history events by date range
  const historyFilter = { taskId: { $in: taskIds } };
  if (startDate || endDate) {
    historyFilter.timestamp = {};
    if (startDate) historyFilter.timestamp.$gte = startDate;
    if (endDate) historyFilter.timestamp.$lte = endDate;
  }

  const history = await TaskHistory.find(historyFilter).lean();

  // Calculate all metrics
  const counts = calculateTaskCounts(tasks);
  const approvals = calculateApprovalMetrics(tasks, history);
  const times = calculateTimeMetrics(history);
  const quality = calculateQualityMetrics(tasks, history);
  const productivityScore = calculateProductivityScore({
    ...counts,
    ...approvals,
    ...quality,
  });

  const metrics = {
    ...counts,
    ...approvals,
    ...times,
    ...quality,
    productivityScore,
  };

  // Get projects for these tasks
  const projects = await Project.find({
    _id: { $in: tasks.map((t) => t.project).filter(Boolean) },
  }).lean();

  // ✅ FIX: Calculate project-specific metrics correctly
  const projectsArray = projects.map((p) => {
    const ptasks = tasks.filter(
      (t) => t.project && t.project.toString() === p._id.toString()
    );
    const assigned = ptasks.length;
    const completed = ptasks.filter((t) => t.status === "done").length;

    // Calculate project-specific approval rate
    const projectTaskIds = new Set(ptasks.map((t) => t._id.toString()));
    const projectApproved = history.filter(
      (h) =>
        h.eventType === "approved" && projectTaskIds.has(h.taskId?.toString())
    ).length;
    const projectRejected = history.filter(
      (h) =>
        h.eventType === "rejected" && projectTaskIds.has(h.taskId?.toString())
    ).length;
    const pApprovalRate =
      projectApproved + projectRejected > 0
        ? (projectApproved / (projectApproved + projectRejected)) * 100
        : 0;

    return {
      projectId: p._id,
      projectName: p.title,
      role: "member",
      tasksAssigned: assigned,
      tasksCompleted: completed,
      approvalRate: Math.round(pApprovalRate * 100) / 100,
    };
  });

  // Get user's workspace
  const user = await User.findById(userIdObj).select("workspaces").lean();
  let workspaceIdObj = null;

  if (
    user &&
    user.workspaces &&
    Array.isArray(user.workspaces) &&
    user.workspaces.length > 0
  ) {
    const wsId = user.workspaces[0];
    if (wsId) {
      try {
        const raw =
          typeof wsId === "object" && wsId !== null
            ? wsId._id ||
              wsId.workspaceId ||
              wsId.id ||
              (wsId.toString && wsId.toString())
            : wsId;
        workspaceIdObj = mongoose.Types.ObjectId.isValid(raw)
          ? typeof raw === "string"
            ? new mongoose.Types.ObjectId(raw)
            : raw
          : null;
        if (!workspaceIdObj)
          console.warn(
            `Invalid workspaceId for user ${userIdObj}:`,
            String(raw)
          );
      } catch (err) {
        console.warn(`Invalid workspaceId for user ${userIdObj}:`, err.message);
      }
    }
  }

  // ✅ FIX: Normalize snapshot date to start of day for consistent daily snapshots
  const snapshotDate = new Date();
  snapshotDate.setHours(0, 0, 0, 0); // Remove time component for daily snapshots

  const period = "daily";

  // ✅ FIX: Use exact date match for snapshot updates
  await EmployeePerformanceSnapshot.updateOne(
    {
      userId: userIdObj,
      period,
      snapshotDate: snapshotDate, // Exact date match (no $lte)
    },
    {
      $set: {
        userId: userIdObj,
        workspaceId: workspaceIdObj,
        period,
        snapshotDate,
        metrics,
        projects: projectsArray,
      },
    },
    { upsert: true }
  );

  return { metrics, projects: projectsArray };
}
