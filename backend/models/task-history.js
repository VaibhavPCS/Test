import mongoose, { Schema } from "mongoose";

const taskHistorySchema = new Schema(
  {
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true },
    eventType: {
      type: String,
      required: true,
      enum: [
        "created",
        "assigned",
        "reassigned",
        "started",
        "paused",
        "resumed",
        "completed",
        "submitted_for_approval",
        "approved",
        "rejected",
        "reopened",
        "due_date_changed",
        "priority_changed",
        "status_changed",
        "deleted"
      ]
    },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    timestamp: { type: Date, default: Date.now, index: true },
    changes: {
      field: { type: String },
      oldValue: { type: Schema.Types.Mixed },
      newValue: { type: Schema.Types.Mixed }
    },
    metadata: {
      previousAssignee: { type: Schema.Types.ObjectId, ref: "User" },
      newAssignee: { type: Schema.Types.ObjectId, ref: "User" },
      rejectionReason: { type: String },
      approvalNotes: { type: String },
      ipAddress: { type: String },
      userAgent: { type: String }
    }
  },
  { timestamps: true }
);

taskHistorySchema.index({ taskId: 1, timestamp: -1 });
taskHistorySchema.index({ actor: 1, timestamp: -1 });
taskHistorySchema.index({ eventType: 1, timestamp: -1 });
taskHistorySchema.index({ timestamp: 1 }, { expireAfterSeconds: 63072000 });

const TaskHistory = mongoose.model("TaskHistory", taskHistorySchema);
export default TaskHistory;

