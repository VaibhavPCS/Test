import mongoose, { Schema } from "mongoose";

const messageSchema = new Schema(
  {
    chat: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      required: true
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      trim: true,
      maxlength: 4000
    },
    type: {
      type: String,
      enum: ['text', 'file', 'system'],
      default: 'text'
    },
    attachments: [{
      fileName: {
        type: String,
        required: true
      },
      originalName: {
        type: String,
        required: true
      },
      fileUrl: {
        type: String,
        required: true
      },
      fileType: {
        type: String,
        enum: ['image', 'document', 'video', 'audio', 'other'],
        required: true
      },
      fileSize: {
        type: Number,
        required: true
      },
      mimeType: {
        type: String,
        required: true
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }],
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: 'Message'
    },
    editHistory: [{
      content: String,
      editedAt: {
        type: Date,
        default: Date.now
      }
    }],
    isEdited: {
      type: Boolean,
      default: false
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date
    },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    readBy: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      readAt: {
        type: Date,
        default: Date.now
      }
    }],
    reactions: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      emoji: {
        type: String,
        required: true
      },
      addedAt: {
        type: Date,
        default: Date.now
      }
    }],
    mentions: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      startIndex: Number,
      endIndex: Number
    }],
    metadata: {
      clientId: String, // For deduplication
      platform: {
        type: String,
        enum: ['web', 'mobile', 'desktop'],
        default: 'web'
      },
      ipAddress: String,
      userAgent: String
    }
  },
  {
    timestamps: true,
  }
);

// Indexes for performance optimization
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ chat: 1, isDeleted: 1, createdAt: -1 });
messageSchema.index({ 'readBy.user': 1, 'readBy.readAt': -1 });
messageSchema.index({ replyTo: 1 });
messageSchema.index({ 'mentions.user': 1 });
messageSchema.index({ content: 'text' }); // Text search

// Virtual for attachment count
messageSchema.virtual('attachmentCount').get(function() {
  return this.attachments ? this.attachments.length : 0;
});

// Virtual for reaction count
messageSchema.virtual('reactionCount').get(function() {
  return this.reactions ? this.reactions.length : 0;
});

// Method to check if user has read the message
messageSchema.methods.isReadBy = function(userId) {
  return this.readBy.some(read => read.user.toString() === userId.toString());
};

// Method to add reaction
messageSchema.methods.addReaction = function(userId, emoji) {
  // Remove existing reaction from this user for this emoji
  this.reactions = this.reactions.filter(r => 
    !(r.user.toString() === userId.toString() && r.emoji === emoji)
  );
  
  // Add new reaction
  this.reactions.push({
    user: userId,
    emoji: emoji,
    addedAt: new Date()
  });
};

// Method to remove reaction
messageSchema.methods.removeReaction = function(userId, emoji) {
  this.reactions = this.reactions.filter(r => 
    !(r.user.toString() === userId.toString() && r.emoji === emoji)
  );
};

// Method to mark as read by user
messageSchema.methods.markAsRead = function(userId) {
  if (!this.isReadBy(userId)) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
  }
};

// Method to edit message content
messageSchema.methods.editContent = function(newContent) {
  if (this.content !== newContent) {
    // Save current content to edit history
    this.editHistory.push({
      content: this.content,
      editedAt: new Date()
    });
    
    // Update content
    this.content = newContent;
    this.isEdited = true;
  }
};

// Pre-save middleware to validate message content
messageSchema.pre('save', function(next) {
  // Ensure message has either content or attachments
  if (!this.content && (!this.attachments || this.attachments.length === 0) && this.type !== 'system') {
    return next(new Error('Message must have either content or attachments'));
  }
  next();
});

const Message = mongoose.model("Message", messageSchema);

export default Message;