import mongoose, { Schema } from "mongoose";
import { createProjectAuditEntry, determineProjectEventType, calculateDelayDays } from "../middleware/audit-logger.js";

const projectSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled'],
      default: 'Planning'
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    creator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    projectHead: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [{
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      addedAt: {
        type: Date,
        default: Date.now
      }
    }],
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    totalTasks: {
      type: Number,
      default: 0,
    },
    completedTasks: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    attachments: [{
      filename: {
        type: String,
        required: true,
      },
      originalName: {
        type: String,
        required: true,
      },
      path: {
        type: String,
        required: true,
      },
      size: {
        type: Number,
      },
      mimeType: {
        type: String,
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      }
    }],
  },
  {
    timestamps: true,
  }
);

// Calculate progress based on status
projectSchema.pre('save', function() {
  const statusProgress = {
    'Planning': 10,
    'In Progress': 50,
    'On Hold': 30,
    'Completed': 100,
    'Cancelled': 0
  };
  
  this.progress = statusProgress[this.status] || 0;
});

projectSchema.add({
  dateChanges: [
    {
      field: { type: String },
      oldValue: { type: Date },
      newValue: { type: Date },
      changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      changedAt: { type: Date },
      reason: { type: String }
    }
  ],
  metrics: {
    timesDeadlineExtended: { type: Number, default: 0 },
    totalDelayDays: { type: Number, default: 0 }
  }
});

projectSchema.pre("save", async function (next) {
  this._wasNew = this.isNew === true;
  if (!this.isNew) {
    const orig = await this.constructor
      .findById(this._id)
      .select("startDate endDate status projectHead members")
      .lean();
    this._auditOriginal = orig || null;
    const o = orig || {};
    const actor = this._auditActor;
    const reason = this._auditMetadata?.reason;
    const now = new Date();
    if (o.startDate && this.startDate && String(o.startDate) !== String(this.startDate)) {
      this.dateChanges = Array.isArray(this.dateChanges) ? this.dateChanges : [];
      this.dateChanges.push({ field: "startDate", oldValue: o.startDate, newValue: this.startDate, changedBy: actor, changedAt: now, reason });
    }
    if (o.endDate && this.endDate && String(o.endDate) !== String(this.endDate)) {
      this.dateChanges = Array.isArray(this.dateChanges) ? this.dateChanges : [];
      this.dateChanges.push({ field: "endDate", oldValue: o.endDate, newValue: this.endDate, changedBy: actor, changedAt: now, reason });
      const addDays = calculateDelayDays(o.endDate, this.endDate);
      if (addDays > 0) {
        this.metrics = this.metrics || {};
        this.metrics.timesDeadlineExtended = (this.metrics.timesDeadlineExtended || 0) + 1;
        this.metrics.totalDelayDays = (this.metrics.totalDelayDays || 0) + addDays;
      }
    }
  }
  next();
});

projectSchema.post("save", async function (doc) {
  try {
    const actor = doc._auditActor || doc.creator;
    const meta = doc._auditMetadata || {};
    if (doc._wasNew) {
      await createProjectAuditEntry(doc._id, "created", actor, { field: "project", oldValue: null, newValue: doc._id }, meta);
      return;
    }
    const modifiedPaths = doc.modifiedPaths ? doc.modifiedPaths() : [];
    const eventData = determineProjectEventType(modifiedPaths, doc._auditOriginal, doc);
    if (eventData) {
      await createProjectAuditEntry(doc._id, eventData.eventType, actor, eventData.changes, { ...eventData.metadata, ...meta });
    }
  } catch (e) {
    console.error(e);
  }
});

projectSchema.pre("findOneAndUpdate", async function (next) {
  const fields = "startDate endDate status projectHead members";
  try {
    this._auditOriginal = await this.model.findOne(this.getQuery()).select(fields).lean();
  } catch (e) {
    this._auditOriginal = null;
  }
  this._auditUpdate = this.getUpdate();
  const opts = this.getOptions() || {};
  this._auditActor = opts.auditActor;
  this._auditMetadata = opts.auditMetadata || {};

  const o = this._auditOriginal || {};
  const u = this._auditUpdate || {};
  const setObj = { ...u, ...(u.$set || {}) };
  const now = new Date();
  const reason = this._auditMetadata?.reason;
  const push = (path, value) => {
    if (!u.$push) u.$push = {};
    u.$push[path] = value;
  };
  const inc = (path, value) => {
    if (!u.$inc) u.$inc = {};
    u.$inc[path] = (u.$inc[path] || 0) + value;
  };
  if (setObj.startDate && String(o.startDate) !== String(setObj.startDate)) {
    push("dateChanges", { field: "startDate", oldValue: o.startDate, newValue: setObj.startDate, changedBy: this._auditActor, changedAt: now, reason });
  }
  if (setObj.endDate && String(o.endDate) !== String(setObj.endDate)) {
    push("dateChanges", { field: "endDate", oldValue: o.endDate, newValue: setObj.endDate, changedBy: this._auditActor, changedAt: now, reason });
    const addDays = calculateDelayDays(o.endDate, setObj.endDate);
    if (addDays > 0) {
      inc("metrics.timesDeadlineExtended", 1);
      inc("metrics.totalDelayDays", addDays);
    }
  }
  next();
});

projectSchema.post("findOneAndUpdate", async function (doc) {
  try {
    if (!doc) return;
    const update = this._auditUpdate || {};
    const keys = new Set([
      ...Object.keys(update || {}),
      ...Object.keys(update.$set || {})
    ]);
    const modifiedPaths = Array.from(keys);
    const eventData = determineProjectEventType(modifiedPaths, this._auditOriginal, doc);
    if (eventData) {
      await createProjectAuditEntry(doc._id, eventData.eventType, this._auditActor || doc.creator, eventData.changes, { ...eventData.metadata, ...this._auditMetadata });
    }
  } catch (e) {
    console.error(e);
  }
});

projectSchema.pre("updateOne", async function (next) {
  const fields = "startDate endDate status projectHead members";
  try {
    this._auditOriginal = await this.model.findOne(this.getQuery()).select(fields).lean();
  } catch (e) {
    this._auditOriginal = null;
  }
  this._auditUpdate = this.getUpdate();
  const opts = this.getOptions() || {};
  this._auditActor = opts.auditActor;
  this._auditMetadata = opts.auditMetadata || {};

  const o = this._auditOriginal || {};
  const u = this._auditUpdate || {};
  const setObj = { ...u, ...(u.$set || {}) };
  const now = new Date();
  const reason = this._auditMetadata?.reason;
  const push = (path, value) => {
    if (!u.$push) u.$push = {};
    u.$push[path] = value;
  };
  const inc = (path, value) => {
    if (!u.$inc) u.$inc = {};
    u.$inc[path] = (u.$inc[path] || 0) + value;
  };
  if (setObj.startDate && String(o.startDate) !== String(setObj.startDate)) {
    push("dateChanges", { field: "startDate", oldValue: o.startDate, newValue: setObj.startDate, changedBy: this._auditActor, changedAt: now, reason });
  }
  if (setObj.endDate && String(o.endDate) !== String(setObj.endDate)) {
    push("dateChanges", { field: "endDate", oldValue: o.endDate, newValue: setObj.endDate, changedBy: this._auditActor, changedAt: now, reason });
    const addDays = calculateDelayDays(o.endDate, setObj.endDate);
    if (addDays > 0) {
      inc("metrics.timesDeadlineExtended", 1);
      inc("metrics.totalDelayDays", addDays);
    }
  }
  next();
});

projectSchema.post("updateOne", async function () {
  try {
    const update = this._auditUpdate || {};
    const keys = new Set([
      ...Object.keys(update || {}),
      ...Object.keys(update.$set || {})
    ]);
    const modifiedPaths = Array.from(keys);
    const after = await this.model.findOne(this.getQuery()).lean();
    if (!after) return;
    const eventData = determineProjectEventType(modifiedPaths, this._auditOriginal, after);
    if (eventData) {
      await createProjectAuditEntry(after._id, eventData.eventType, this._auditActor, eventData.changes, { ...eventData.metadata, ...this._auditMetadata });
    }
  } catch (e) {
    console.error(e);
  }
});

const Project = mongoose.model("Project", projectSchema);

export default Project;
