// ✅ CORRECT: Calculate task counts from user's tasks only
export const calculateTaskCounts = (tasks) => {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "done").length;
  const todo = tasks.filter((t) => t.status === "to-do").length;
  const inProgress = tasks.filter((t) => t.status === "in-progress").length;
  const overdue = tasks.filter(
    (t) =>
      t.dueDate && t.status !== "done" && new Date(t.dueDate) < new Date()
  ).length;
  return { total, completed, todo, inProgress, overdue };
};

// ✅ FIX: Only count approval/rejection events for THIS USER'S tasks
export const calculateApprovalMetrics = (tasks, history) => {
  const taskIds = new Set(tasks.map((t) => t._id?.toString?.() || String(t._id)));

  const approvedFromTasks = tasks.filter((t) => t.approvalStatus === "approved").length;
  const rejectedFromTasks = tasks.filter((t) => t.approvalStatus === "rejected").length;

  const approved = approvedFromTasks;
  const rejected = rejectedFromTasks;

  const pendingApproval = tasks.filter(
    (t) => t.approvalStatus === "pending-approval"
  ).length;

  const approvalRate =
    approved + rejected > 0 ? (approved / (approved + rejected)) * 100 : 0;

  const submissions = history.filter(
    (h) =>
      h.eventType === "submitted_for_approval" &&
      taskIds.has(h.taskId?.toString())
  );

  const firstTimeApprovalRate =
    submissions.length > 0 ? (approved / submissions.length) * 100 : 0;

  const totalRejections = tasks.reduce((sum, t) => sum + (t.metrics?.timesRejected || 0), 0);
  const avgRejectionsPerTask = tasks.length > 0 ? totalRejections / tasks.length : 0;

  return {
    approved,
    rejected,
    pendingApproval,
    approvalRate,
    firstTimeApprovalRate,
    avgRejectionsPerTask,
  };
};

// ✅ IMPROVED: Handle edge cases for tasks without 'started' events
export const calculateTimeMetrics = (history) => {
  const byTask = new Map();
  for (const h of history) {
    const id = h.taskId?.toString?.() || h.taskId;
    if (!byTask.has(id)) byTask.set(id, []);
    byTask.get(id).push(h);
  }

  let startSum = 0,
    completeSum = 0,
    approveSum = 0,
    countStart = 0,
    countComplete = 0,
    countApprove = 0,
    totalActiveTime = 0;

  for (const [, events] of byTask.entries()) {
    const created = events.find((e) => e.eventType === "created");
    const started = events.find((e) => e.eventType === "started");
    const assigned = events.find((e) => e.eventType === "assigned");
    const completed = events.find((e) => e.eventType === "completed");
    const submitted = events.find(
      (e) => e.eventType === "submitted_for_approval"
    );
    const approved = events.find((e) => e.eventType === "approved");

    const toHours = (ms) => ms / (1000 * 60 * 60);

    // ✅ IMPROVEMENT: Use 'started' if exists, otherwise fallback to 'assigned'
    const startEvent = started || assigned;

    if (created && startEvent) {
      startSum += toHours(
        new Date(startEvent.timestamp) - new Date(created.timestamp)
      );
      countStart++;
    }

    if (created && completed) {
      completeSum += toHours(
        new Date(completed.timestamp) - new Date(created.timestamp)
      );
      countComplete++;
    }

    if (submitted && approved) {
      approveSum += toHours(
        new Date(approved.timestamp) - new Date(submitted.timestamp)
      );
      countApprove++;
    }

    if (startEvent && completed) {
      totalActiveTime += toHours(
        new Date(completed.timestamp) - new Date(startEvent.timestamp)
      );
    }
  }

  return {
    avgTimeToStart: countStart
      ? Math.round((startSum / countStart) * 100) / 100
      : 0,
    avgTimeToComplete: countComplete
      ? Math.round((completeSum / countComplete) * 100) / 100
      : 0,
    avgTimeToApproval: countApprove
      ? Math.round((approveSum / countApprove) * 100) / 100
      : 0,
    totalActiveTime: Math.round(totalActiveTime * 100) / 100,
  };
};

// ✅ CORRECT: Calculate quality metrics from user's tasks
export const calculateQualityMetrics = (tasks, history) => {
  const reassignments = history.filter((h) => h.eventType === "reassigned").length;
  const completed = tasks.filter((t) => t.status === "done");
  const onTime = completed.filter(
    (t) =>
      t.completedAt &&
      t.dueDate &&
      new Date(t.completedAt) <= new Date(t.dueDate)
  ).length;
  const onTimeCompletionRate = completed.length ? (onTime / completed.length) * 100 : 0;
  const reworkRate = tasks.length ? (reassignments / tasks.length) * 100 : 0;
  return { reworkRate, onTimeCompletionRate };
};

// ✅ CORRECT: Calculate productivity score
export const calculateProductivityScore = (metrics) => {
  const approvalRate = metrics.approvalRate || 0;
  const onTimeRate = metrics.onTimeCompletionRate || 0;
  const velocity = metrics.completed || 0; // proxy per period
  const qualityScore = 100 - (metrics.avgRejectionsPerTask || 0) * 10;
  const score =
    approvalRate * 0.4 +
    onTimeRate * 0.3 +
    velocity * 0.2 +
    qualityScore * 0.1;
  return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
};
