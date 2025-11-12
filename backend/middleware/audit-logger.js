import TaskHistory from "../models/task-history.js";

export const createAuditEntry = async (taskId, eventType, actor, changes = {}, metadata = {}) => {
  try {
    const payload = { taskId, eventType, actor, timestamp: new Date(), changes, metadata };
    setImmediate(() => {
      TaskHistory.create(payload).catch((e) => console.error(e));
    });
  } catch (e) {
    console.error(e);
  }
};

export const determineEventType = (modifiedPaths, oldDoc, newDoc) => {
  const mp = new Set(modifiedPaths || []);
  if (mp.has("isActive")) {
    const oldI = oldDoc?.isActive;
    const newI = newDoc?.isActive;
    if (oldI === true && newI === false) {
      return { eventType: "deleted", changes: { field: "isActive", oldValue: oldI, newValue: newI }, metadata: {} };
    }
  }
  if (mp.has("assignee")) {
    const oldA = oldDoc?.assignee || null;
    const newA = newDoc?.assignee || null;
    if (!oldA && newA) {
      return {
        eventType: "assigned",
        changes: { field: "assignee", oldValue: oldA, newValue: newA },
        metadata: { newAssignee: newA }
      };
    }
    if (oldA && newA && String(oldA) !== String(newA)) {
      return {
        eventType: "reassigned",
        changes: { field: "assignee", oldValue: oldA, newValue: newA },
        metadata: { previousAssignee: oldA, newAssignee: newA }
      };
    }
  }
  if (mp.has("status")) {
    const oldS = oldDoc?.status;
    const newS = newDoc?.status;
    if (newS === "in-progress" && oldS !== "in-progress") {
      return { eventType: "started", changes: { field: "status", oldValue: oldS, newValue: newS }, metadata: {} };
    }
    if (newS === "done" && oldS !== "done") {
      return { eventType: "completed", changes: { field: "status", oldValue: oldS, newValue: newS }, metadata: {} };
    }
    if (oldS !== newS) {
      return { eventType: "status_changed", changes: { field: "status", oldValue: oldS, newValue: newS }, metadata: {} };
    }
  }
  if (mp.has("approvalStatus")) {
    const oldAp = oldDoc?.approvalStatus;
    const newAp = newDoc?.approvalStatus;
    if (newAp === "pending-approval" && oldAp !== "pending-approval") {
      return { eventType: "submitted_for_approval", changes: { field: "approvalStatus", oldValue: oldAp, newValue: newAp }, metadata: {} };
    }
    if (newAp === "approved" && oldAp !== "approved") {
      return { eventType: "approved", changes: { field: "approvalStatus", oldValue: oldAp, newValue: newAp }, metadata: { approvalNotes: newDoc?.approvalNotes } };
    }
    if (newAp === "rejected" && oldAp !== "rejected") {
      return { eventType: "rejected", changes: { field: "approvalStatus", oldValue: oldAp, newValue: newAp }, metadata: { rejectionReason: newDoc?.rejectionReason } };
    }
  }
  if (mp.has("dueDate")) {
    const oldD = oldDoc?.dueDate;
    const newD = newDoc?.dueDate;
    if (String(oldD) !== String(newD)) {
      return { eventType: "due_date_changed", changes: { field: "dueDate", oldValue: oldD, newValue: newD }, metadata: {} };
    }
  }
  if (mp.has("priority")) {
    const oldP = oldDoc?.priority;
    const newP = newDoc?.priority;
    if (oldP !== newP) {
      return { eventType: "priority_changed", changes: { field: "priority", oldValue: oldP, newValue: newP }, metadata: {} };
    }
  }
  return null;
};
