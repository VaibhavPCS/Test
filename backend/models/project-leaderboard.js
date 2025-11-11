import mongoose, { Schema } from "mongoose";

// Create separate connection for reporting database
const reportingDB = mongoose.createConnection(process.env.REPORTING_DB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
});

reportingDB.on('connected', () => {
  console.log('✅ ProjectLeaderboard: Reporting Database connected');
});

reportingDB.on('error', (err) => {
  console.error('❌ ProjectLeaderboard: Reporting Database error:', err.message);
});

const projectLeaderboardSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      unique: true,
      index: true
    },
    projectName: {
      type: String,
      required: true,
      trim: true
    },
    projectHead: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      userName: {
        type: String,
        required: true
      }
    },
    status: {
      type: String,
      enum: ['On Track', 'At Risk', 'Off Track', 'Completed'],
      required: true,
      default: 'On Track'
    },
    completionPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0
    },
    dueDate: {
      type: Date,
      required: true
    },
    lastUpdatedAt: {
      type: Date,
      required: true,
      default: Date.now
    }
  },
  {
    timestamps: true,
    collection: 'project_leaderboard'
  }
);

// Compound index for efficient sorting by completion percentage and due date
projectLeaderboardSchema.index({ completionPercentage: 1, dueDate: 1 });

// Use reportingDB connection instead of default
const ProjectLeaderboard = reportingDB.model("ProjectLeaderboard", projectLeaderboardSchema);

export default ProjectLeaderboard;
