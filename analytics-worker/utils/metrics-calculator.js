export const calculateTaskCounts = (tasks) => {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'done').length;
  const todo = tasks.filter(t => t.status === 'to-do').length;
  const inProgress = tasks.filter(t => t.status === 'in-progress').length;
  const overdue = tasks.filter(t => t.dueDate && t.status !== 'done' && new Date(t.dueDate) < new Date()).length;
  return { total, completed, todo, inProgress, overdue };
};

export const calculateApprovalMetrics = (tasks, history) => {
  const approved = history.filter(h => h.eventType === 'approved').length;
  const rejected = history.filter(h => h.eventType === 'rejected').length;
  const pendingApproval = tasks.filter(t => t.approvalStatus === 'pending-approval').length;
  const approvalRate = (approved + rejected) > 0 ? (approved / (approved + rejected)) * 100 : 0;
  const firstTimeApprovalRate = (() => {
    const submissions = history.filter(h => h.eventType === 'submitted_for_approval');
    if (submissions.length === 0) return 0;
    const firstApprovals = history.filter(h => h.eventType === 'approved');
    // naive proxy
    return (firstApprovals.length / submissions.length) * 100;
  })();
  const avgRejectionsPerTask = tasks.length > 0 ? (rejected / tasks.length) : 0;
  return { approved, rejected, pendingApproval, approvalRate, firstTimeApprovalRate, avgRejectionsPerTask };
};

export const calculateTimeMetrics = (history) => {
  const byTask = new Map();
  for (const h of history) {
    const id = h.taskId?.toString?.() || h.taskId;
    if (!byTask.has(id)) byTask.set(id, []);
    byTask.get(id).push(h);
  }
  let startSum = 0, completeSum = 0, approveSum = 0, countStart = 0, countComplete = 0, countApprove = 0, totalActiveTime = 0;
  for (const [, events] of byTask.entries()) {
    const created = events.find(e => e.eventType === 'created');
    const started = events.find(e => e.eventType === 'started');
    const completed = events.find(e => e.eventType === 'completed');
    const submitted = events.find(e => e.eventType === 'submitted_for_approval');
    const approved = events.find(e => e.eventType === 'approved');
    const toHours = (ms) => ms / (1000 * 60 * 60);
    if (created && started) { startSum += toHours(new Date(started.timestamp) - new Date(created.timestamp)); countStart++; }
    if (created && completed) { completeSum += toHours(new Date(completed.timestamp) - new Date(created.timestamp)); countComplete++; }
    if (submitted && approved) { approveSum += toHours(new Date(approved.timestamp) - new Date(submitted.timestamp)); countApprove++; }
    if (started && completed) { totalActiveTime += toHours(new Date(completed.timestamp) - new Date(started.timestamp)); }
  }
  return {
    avgTimeToStart: countStart ? Math.round((startSum / countStart) * 100) / 100 : 0,
    avgTimeToComplete: countComplete ? Math.round((completeSum / countComplete) * 100) / 100 : 0,
    avgTimeToApproval: countApprove ? Math.round((approveSum / countApprove) * 100) / 100 : 0,
    totalActiveTime: Math.round(totalActiveTime * 100) / 100
  };
};

export const calculateQualityMetrics = (tasks, history) => {
  const reassignments = history.filter(h => h.eventType === 'reassigned').length;
  const completed = tasks.filter(t => t.status === 'done');
  const onTime = completed.filter(t => t.completedAt && t.dueDate && new Date(t.completedAt) <= new Date(t.dueDate)).length;
  const onTimeCompletionRate = completed.length ? (onTime / completed.length) * 100 : 0;
  const reworkRate = tasks.length ? (reassignments / tasks.length) * 100 : 0;
  return { reworkRate, onTimeCompletionRate };
};

export const calculateProductivityScore = (metrics) => {
  const approvalRate = metrics.approvalRate || 0;
  const onTimeRate = metrics.onTimeCompletionRate || 0;
  const velocity = metrics.completed || 0; // proxy per period
  const qualityScore = 100 - (metrics.avgRejectionsPerTask || 0) * 10;
  const score = (approvalRate * 0.4) + (onTimeRate * 0.3) + (velocity * 0.2) + (qualityScore * 0.1);
  return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
};

