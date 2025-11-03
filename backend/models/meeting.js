import mongoose, { Schema } from "mongoose";

const meetingSchema = new Schema(
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
    scheduledDate: {
      type: Date,
      required: true
    },
    duration: {
      type: Number, // Duration in minutes
      default: 60,
      min: 15
    },
    meetingLink: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          if (!v) return true; // Optional field
          return /^https?:\/\/.+/.test(v);
        },
        message: 'Meeting link must be a valid URL'
      }
    },
    organizer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    participants: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      status: {
        type: String,
        enum: ['invited', 'accepted', 'declined', 'tentative'],
        default: 'invited'
      },
      responseDate: {
        type: Date
      }
    }],
    emailParticipants: [{
      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
      },
      name: {
        type: String,
        trim: true
      },
      status: {
        type: String,
        enum: ['invited', 'accepted', 'declined', 'tentative'],
        default: 'invited'
      },
      responseDate: {
        type: Date
      }
    }],
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project'
    },
    attachments: [
      {
        fileName: { type: String, required: true },
        fileUrl: { type: String, required: true },
        fileType: { type: String, enum: ['image', 'document'], required: true },
        fileSize: { type: Number, required: true },
        mimeType: { type: String, required: true }
      }
    ],
    status: {
      type: String,
      enum: ['scheduled', 'in-progress', 'completed', 'cancelled'],
      default: 'scheduled'
    },
    remindersSent: {
      twentyFourHour: {
        type: Boolean,
        default: false
      },
      oneHour: {
        type: Boolean,
        default: false
      }
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
meetingSchema.index({ scheduledDate: 1, workspace: 1 });
meetingSchema.index({ organizer: 1, scheduledDate: 1 });
meetingSchema.index({ 'participants.user': 1, scheduledDate: 1 });

const Meeting = mongoose.model("Meeting", meetingSchema);
export default Meeting;