import mongoose, { Schema } from "mongoose";

const projectHistorySchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    eventType: {
      type: String,
      required: true,
      enum: [
        "created",
        "status_changed",
        "start_date_changed",
        "end_date_changed",
        "member_added",
        "member_removed",
        "head_changed",
        "completed",
        "cancelled",
        "reopened"
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
      reason: { type: String },
      affectedPhase: { type: String },
      ipAddress: { type: String }
    }
  },
  { timestamps: true }
);

projectHistorySchema.index({ projectId: 1, timestamp: -1 });
projectHistorySchema.index({ actor: 1, timestamp: -1 });
projectHistorySchema.index({ timestamp: 1 }, { expireAfterSeconds: 63072000 });

const ProjectHistory = mongoose.model("ProjectHistory", projectHistorySchema);
export default ProjectHistory;

