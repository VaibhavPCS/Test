import mongoose, { Schema } from "mongoose";

const notificationSchema = new Schema(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    type: {
      type: String,
      enum: [
        "workspace_invite",
        "task_assigned",
        "task_updated",
        "task_comment",
        "comment_reply",
        "project_created",
        "project_updated",
        "member_joined",
        "member_left",
        "meeting_invite",
        "meeting_updated",
        "meeting_cancelled",
        "meeting_response",
        "meeting_reminder",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    data: {
      workspaceId: {
        type: Schema.Types.ObjectId,
        ref: "Workspace",
      },
      projectId: {
        type: Schema.Types.ObjectId,
        ref: "Project",
      },
      taskId: {
        type: Schema.Types.ObjectId,
        ref: "Task",
      },
      inviteId: {
        type: Schema.Types.ObjectId,
        ref: "Invite",
      },
      meetingId: {
        type: Schema.Types.ObjectId,
        ref: "Meeting",
      },
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    relatedTask: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
    },
    relatedComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
    },
  },
  {
    timestamps: true,
  }
);

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
