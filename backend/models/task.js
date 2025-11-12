import mongoose, { Schema } from "mongoose";
import { createAuditEntry, determineEventType } from "../middleware/audit-logger.js";

const taskSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['to-do', 'in-progress', 'done'],
      default: 'to-do'
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    assignee: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false // ✅ UPDATED: Made optional - tasks can be created without assignment
    },
    creator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true
    },
    // ✅ REMOVED: category field no longer needed with new project structure
    // ✅ NEW: Required start date
    startDate: {
      type: Date,
      required: true
    },
    dueDate: {
      type: Date,
      required: true
    },
    // ✅ NEW: Duration in days (computed field)
    durationDays: {
      type: Number,
      default: 1,
      min: 1
    },
    completedAt: {
      type: Date
    },
    // ✅ NEW: Approval workflow fields
    approvalStatus: {
      type: String,
      enum: ['not-required', 'pending-approval', 'approved', 'rejected'],
      default: 'not-required'
    },
    completedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: {
      type: Date
    },
    rejectionReason: {
      type: String,
      trim: true
    },
    handoverNotes: {
      type: String,
      trim: true,
      default: ''
    },
    handoverAttachments: [
      {
        fileName: { type: String, required: true },
        fileUrl: { type: String, required: true },
        fileType: { type: String, enum: ['image', 'document'], required: true },
        fileSize: { type: Number, required: true },
        mimeType: { type: String, required: true }
      }
    ],
    // Task creation attachments
    attachments: [
      {
        fileName: { type: String, required: true },
        fileUrl: { type: String, required: true },
        fileType: { type: String, enum: ['image', 'document'], required: true },
        fileSize: { type: Number, required: true },
        mimeType: { type: String, required: true }
      }
    ],
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
  }
);

taskSchema.add({
  startedAt: { type: Date },
  submittedForApprovalAt: { type: Date },
  rejections: [{
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rejectedAt: { type: Date, required: true },
    reason: { type: String },
    reassignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    newDueDate: { type: Date }
  }],
  metrics: {
    timesReassigned: { type: Number, default: 0 },
    timesRejected: { type: Number, default: 0 },
    totalWorkingTime: { type: Number, default: 0 },
    approvalAttempts: { type: Number, default: 0 }
  }
});

taskSchema.path('rejections').validate(function(rejections) {
  if (!Array.isArray(rejections)) return true;
  for (const r of rejections) {
    if (!r.rejectedBy || !r.rejectedAt) {
      return false;
    }
  }
  return true;
}, 'Each rejection must have rejectedBy and rejectedAt');

taskSchema.path('metrics.timesReassigned').validate(function(val) {
  return val === undefined || val >= 0;
}, 'timesReassigned cannot be negative');

taskSchema.path('metrics.timesRejected').validate(function(val) {
  return val === undefined || val >= 0;
}, 'timesRejected cannot be negative');

taskSchema.path('metrics.totalWorkingTime').validate(function(val) {
  return val === undefined || val >= 0;
}, 'totalWorkingTime cannot be negative');

taskSchema.path('metrics.approvalAttempts').validate(function(val) {
  return val === undefined || val >= 0;
}, 'approvalAttempts cannot be negative');

 

taskSchema.pre("save", async function (next) {
  this._wasNew = this.isNew === true;
  if (!this.isNew) {
    const orig = await this.constructor
      .findById(this._id)
      .select("assignee status approvalStatus dueDate priority rejectionReason isActive")
      .lean();
    this._auditOriginal = orig || null;
  }
  next();
});

taskSchema.post("save", async function (doc) {
  try {
    const actor = doc._auditActor || doc.creator;
    const meta = doc._auditMetadata || {};
    if (doc._wasNew) {
      await createAuditEntry(doc._id, "created", actor, { field: "task", oldValue: null, newValue: doc._id }, meta);
      return;
    }
    const modifiedPaths = doc.modifiedPaths ? doc.modifiedPaths() : [];
    const eventData = determineEventType(modifiedPaths, doc._auditOriginal, doc);
    if (eventData) {
      await createAuditEntry(doc._id, eventData.eventType, actor, eventData.changes, { ...eventData.metadata, ...meta });
    }
  } catch (e) {
    console.error(e);
  }
});



taskSchema.pre("findOneAndUpdate", async function (next) {
  const fields = "assignee status approvalStatus dueDate priority rejectionReason isActive";
  try {
    this._auditOriginal = await this.model.findOne(this.getQuery()).select(fields).lean();
  } catch (e) {
    this._auditOriginal = null;
  }
  this._auditUpdate = this.getUpdate();
  const opts = this.getOptions() || {};
  this._auditActor = opts.auditActor;
  this._auditMetadata = opts.auditMetadata || {};
  next();
});

taskSchema.post("findOneAndUpdate", async function (doc) {
  try {
    if (!doc) return;
    const update = this._auditUpdate || {};
    const keys = new Set([
      ...Object.keys(update || {}),
      ...Object.keys(update.$set || {})
    ]);
    const modifiedPaths = Array.from(keys);
    const eventData = determineEventType(modifiedPaths, this._auditOriginal, doc);
    if (eventData) {
      await createAuditEntry(doc._id, eventData.eventType, this._auditActor || doc.creator, eventData.changes, { ...eventData.metadata, ...this._auditMetadata });
    }
  } catch (e) {
    console.error(e);
  }
});



taskSchema.pre("updateOne", async function (next) {
  const fields = "assignee status approvalStatus dueDate priority rejectionReason isActive";
  try {
    this._auditOriginal = await this.model.findOne(this.getQuery()).select(fields).lean();
  } catch (e) {
    this._auditOriginal = null;
  }
  this._auditUpdate = this.getUpdate();
  const opts = this.getOptions() || {};
  this._auditActor = opts.auditActor;
  this._auditMetadata = opts.auditMetadata || {};
  next();
});

taskSchema.post("updateOne", async function () {
  try {
    const update = this._auditUpdate || {};
    const keys = new Set([
      ...Object.keys(update || {}),
      ...Object.keys(update.$set || {})
    ]);
    const modifiedPaths = Array.from(keys);
    const after = await this.model.findOne(this.getQuery()).lean();
    if (!after) return;
    const eventData = determineEventType(modifiedPaths, this._auditOriginal, after);
    if (eventData) {
      await createAuditEntry(after._id, eventData.eventType, this._auditActor, eventData.changes, { ...eventData.metadata, ...this._auditMetadata });
    }
  } catch (e) {
    console.error(e);
  }
});

const Task = mongoose.model("Task", taskSchema);
export default Task;
