import TaskHistory from "../models/task-history.js";
import ProjectHistory from "../models/project-history.js";

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

export const createProjectAuditEntry = async (projectId, eventType, actor, changes = {}, metadata = {}) => {
  try {
    const payload = { projectId, eventType, actor, timestamp: new Date(), changes, metadata };
    setImmediate(() => {
      ProjectHistory.create(payload).catch((e) => console.error(e));
    });
  } catch (e) {
    console.error(e);
  }
};

export const determineProjectEventType = (modifiedPaths, oldDoc, newDoc) => {
  const mp = new Set(modifiedPaths || []);
  if (mp.has("startDate")) {
    const o = oldDoc?.startDate;
    const n = newDoc?.startDate;
    if (String(o) !== String(n)) {
      return { eventType: "start_date_changed", changes: { field: "startDate", oldValue: o, newValue: n }, metadata: {} };
    }
  }
  if (mp.has("endDate")) {
    const o = oldDoc?.endDate;
    const n = newDoc?.endDate;
    if (String(o) !== String(n)) {
      return { eventType: "end_date_changed", changes: { field: "endDate", oldValue: o, newValue: n }, metadata: {} };
    }
  }
  if (mp.has("status")) {
    const o = oldDoc?.status;
    const n = newDoc?.status;
    if (o !== n) {
      let evt = "status_changed";
      if (n === "Completed") evt = "completed";
      else if (n === "Cancelled") evt = "cancelled";
      else if (o === "Cancelled" && n !== "Cancelled") evt = "reopened";
      return { eventType: evt, changes: { field: "status", oldValue: o, newValue: n }, metadata: {} };
    }
  }
  if (mp.has("projectHead")) {
    const o = oldDoc?.projectHead;
    const n = newDoc?.projectHead;
    if (String(o) !== String(n)) {
      return { eventType: "head_changed", changes: { field: "projectHead", oldValue: o, newValue: n }, metadata: {} };
    }
  }
  if (mp.has("members")) {
    const oLen = Array.isArray(oldDoc?.members) ? oldDoc.members.length : 0;
    const nLen = Array.isArray(newDoc?.members) ? newDoc.members.length : 0;
    if (nLen > oLen) return { eventType: "member_added", changes: { field: "members", oldValue: oLen, newValue: nLen }, metadata: {} };
    if (nLen < oLen) return { eventType: "member_removed", changes: { field: "members", oldValue: oLen, newValue: nLen }, metadata: {} };
  }
  return null;
};

export const calculateDelayDays = (oldDate, newDate) => {
  if (!oldDate || !newDate) return 0;
  const o = new Date(oldDate);
  const n = new Date(newDate);
  const diff = n.getTime() - o.getTime();
  if (diff <= 0) return 0;
  const dayMs = 1000 * 60 * 60 * 24;
  return Math.ceil(diff / dayMs);
};
