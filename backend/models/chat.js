import mongoose, { Schema } from "mongoose";

const chatSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500
    },
    type: {
      type: String,
      enum: ['group', 'direct'],
      default: 'group'
    },
    creator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true
    },
    participants: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      role: {
        type: String,
        enum: ['admin', 'member'],
        default: 'member'
      },
      joinedAt: {
        type: Date,
        default: Date.now
      },
      lastReadAt: {
        type: Date,
        default: Date.now
      },
      isActive: {
        type: Boolean,
        default: true
      }
    }],
    settings: {
      allowFileSharing: {
        type: Boolean,
        default: true
      },
      allowMessageEditing: {
        type: Boolean,
        default: true
      },
      allowMessageDeletion: {
        type: Boolean,
        default: true
      },
      maxFileSize: {
        type: Number,
        default: 10485760 // 10MB in bytes
      }
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message'
    },
    lastActivity: {
      type: Date,
      default: Date.now
    },
    messageCount: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isArchived: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
  }
);

// Indexes for performance optimization
chatSchema.index({ workspace: 1, isActive: 1 });
chatSchema.index({ creator: 1, createdAt: -1 });
chatSchema.index({ 'participants.user': 1, isActive: 1 });
chatSchema.index({ lastActivity: -1, workspace: 1 });
chatSchema.index({ name: 'text', description: 'text' }); // Text search

// Virtual for participant count
chatSchema.virtual('participantCount').get(function() {
  return this.participants.filter(p => p.isActive).length;
});

// Method to check if user is participant
chatSchema.methods.isParticipant = function(userId) {
  return this.participants.some(p => 
    p.user.toString() === userId.toString() && p.isActive
  );
};

// Method to check if user is admin of the chat
chatSchema.methods.isChatAdmin = function(userId) {
  const participant = this.participants.find(p => 
    p.user.toString() === userId.toString() && p.isActive
  );
  return participant && (participant.role === 'admin' || this.creator.toString() === userId.toString());
};

// Method to get participant by user ID
chatSchema.methods.getParticipant = function(userId) {
  return this.participants.find(p => 
    p.user.toString() === userId.toString() && p.isActive
  );
};

const Chat = mongoose.model("Chat", chatSchema);

export default Chat;