import mongoose, { Schema } from "mongoose";

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

const Task = mongoose.model("Task", taskSchema);
export default Task;
