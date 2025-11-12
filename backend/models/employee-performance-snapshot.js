import mongoose, { Schema } from "mongoose";

const reportingDB = mongoose.createConnection(process.env.REPORTING_DB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
});

reportingDB.on('connected', () => {
  console.log('✅ EmployeePerformanceSnapshot: Reporting DB connected');
});

reportingDB.on('error', (err) => {
  console.error('❌ EmployeePerformanceSnapshot: Reporting DB error:', err.message);
});

const employeePerformanceSnapshotSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  snapshotDate: { type: Date, required: true, index: true, default: Date.now },
  period: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true, index: true },
  metrics: {
    total: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    todo: { type: Number, default: 0 },
    inProgress: { type: Number, default: 0 },
    overdue: { type: Number, default: 0 },
    approved: { type: Number, default: 0 },
    rejected: { type: Number, default: 0 },
    pendingApproval: { type: Number, default: 0 },
    approvalRate: { type: Number, default: 0 },
    firstTimeApprovalRate: { type: Number, default: 0 },
    avgRejectionsPerTask: { type: Number, default: 0 },
    avgTimeToStart: { type: Number, default: 0 },
    avgTimeToComplete: { type: Number, default: 0 },
    avgTimeToApproval: { type: Number, default: 0 },
    totalActiveTime: { type: Number, default: 0 },
    reworkRate: { type: Number, default: 0 },
    onTimeCompletionRate: { type: Number, default: 0 },
    productivityScore: { type: Number, default: 0 }
  },
  projects: [{
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    projectName: { type: String },
    role: { type: String },
    tasksAssigned: { type: Number, default: 0 },
    tasksCompleted: { type: Number, default: 0 },
    approvalRate: { type: Number, default: 0 }
  }],
  rankings: {
    inWorkspace: { type: Number, default: 0 },
    totalInWorkspace: { type: Number, default: 0 },
    percentile: { type: Number, default: 0 },
    rank: { type: Number, default: 0 }
  },
  trends: {
    tasksCompletedChange: { type: Number, default: 0 },
    approvalRateChange: { type: Number, default: 0 },
    productivityScoreChange: { type: Number, default: 0 }
  }
}, { timestamps: true, collection: 'employee_performance_snapshots' });

employeePerformanceSnapshotSchema.index({ userId: 1, period: 1, snapshotDate: -1 });
employeePerformanceSnapshotSchema.index({ snapshotDate: -1, period: 1 });

const EmployeePerformanceSnapshot = reportingDB.model('EmployeePerformanceSnapshot', employeePerformanceSnapshotSchema);

export default EmployeePerformanceSnapshot;

