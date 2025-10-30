import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    profilePicture: {
      type: String,
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'super_admin'],
      default: 'user'
    },
    // ✅ ADD THESE WORKSPACE FIELDS:
    workspaces: [{
      workspaceId: {
        type: Schema.Types.ObjectId,
        ref: 'Workspace'
      },
      role: {
        type: String,
        enum: ['owner', 'admin', 'lead', 'member', 'viewer'],
        required: true
      },
      joinedAt: {
        type: Date,
        default: Date.now
      }
    }],
    currentWorkspace: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace'
    },
    // ✅ END OF WORKSPACE FIELDS
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    otp: {
      type: String,
      default: null,
    },
    otpExpiresAt: {
      type: Date,
      default: null,
    },
    otpType: {
      type: String,
      enum: ["registration", "login", "password-reset"],
      default: null,
    },
    lastLogin: {
      type: Date,
    },
    is2FAEnabled: {
      type: Boolean,
      default: false,
    },
    twoFAOtp: {
      type: String,
      select: false,
    },
    twoFAOtpExpires: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for better query performance
userSchema.index({ email: 1 }); // Already unique, but explicit index
userSchema.index({ 'workspaces.workspaceId': 1 }); // For workspace queries
userSchema.index({ currentWorkspace: 1 }); // For current workspace lookups
userSchema.index({ isEmailVerified: 1 }); // For filtering verified users
userSchema.index({ createdAt: -1 }); // For sorting by creation date
userSchema.index({ lastLogin: -1 }); // For activity tracking

const User = mongoose.model("User", userSchema);

export default User;
