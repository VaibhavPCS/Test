import mongoose from 'mongoose';

const workspaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'lead', 'member', 'viewer', 'head'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: {
    type: Date
  },
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deleteScheduledAt: {
    type: Date
  }
}, {
  timestamps: true
});

// ✅ Archive functionality - Auto delete after 7 days
workspaceSchema.methods.archiveWorkspace = function(userId) {
  this.isArchived = true;
  this.archivedAt = new Date();
  this.archivedBy = userId;
  this.deleteScheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  return this.save();
};

workspaceSchema.methods.restoreWorkspace = function() {
  this.isArchived = false;
  this.archivedAt = undefined;
  this.archivedBy = undefined;
  this.deleteScheduledAt = undefined;
  return this.save();
};

export default mongoose.model('Workspace', workspaceSchema);
