import mongoose from 'mongoose';

// Stores removed workspace memberships for 7 days with TTL cleanup.
// When a user is re-added within retention, we can restore prior context.
const workspaceMemberArchiveSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  role: {
    type: String,
    enum: ['admin', 'lead', 'member', 'viewer', 'head'],
    required: true,
  },
  removedAt: {
    type: Date,
    default: Date.now,
  },
  // TTL based expiry: document will be removed automatically when expiresAt passes
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 },
  },
}, { timestamps: true });

export default mongoose.model('WorkspaceMemberArchive', workspaceMemberArchiveSchema);