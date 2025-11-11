import mongoose, { Schema } from "mongoose";

// Create separate connection for reporting database
const reportingDB = mongoose.createConnection(process.env.REPORTING_DB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
});

reportingDB.on('connected', () => {
  console.log('✅ WorkspaceSummary: Reporting Database connected');
});

reportingDB.on('error', (err) => {
  console.error('❌ WorkspaceSummary: Reporting Database error:', err.message);
});

const workspaceSummarySchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      unique: true,
      index: true
    },
    overallCompletionRate: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0
    },
    activeProjects: [{
      projectId: {
        type: Schema.Types.ObjectId,
        ref: 'Project',
        required: true
      },
      projectName: {
        type: String,
        required: true
      }
    }],
    workloadDistribution: [{
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      userName: {
        type: String,
        required: true
      },
      openTaskCount: {
        type: Number,
        required: true,
        default: 0
      }
    }],
    lastUpdatedAt: {
      type: Date,
      required: true,
      default: Date.now
    }
  },
  {
    timestamps: true,
    collection: 'workspace_summaries'
  }
);

// Use reportingDB connection instead of default
const WorkspaceSummary = reportingDB.model("WorkspaceSummary", workspaceSummarySchema);

export default WorkspaceSummary;
