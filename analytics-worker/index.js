import cron from 'node-cron';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { aggregateAnalytics } from './jobs/aggregateAnalytics.js';
import { aggregateAllEmployees } from './jobs/employee-aggregation.js';

dotenv.config();

// Database connections
const mainDB = mongoose.createConnection(process.env.MAIN_DB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

const reportingDB = mongoose.createConnection(process.env.REPORTING_DB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

// Connection event handlers
mainDB.on('connected', () => {
  console.log('✅ Analytics Worker: Main Database connected');
  registerMainModels(mainDB);
});

mainDB.on('error', (err) => {
  console.error('❌ Analytics Worker: Main Database error:', err.message);
});

reportingDB.on('connected', () => {
  console.log('✅ Analytics Worker: Reporting Database connected');
  registerReportingModels(reportingDB);
});

reportingDB.on('error', (err) => {
  console.error('❌ Analytics Worker: Reporting Database error:', err.message);
});

// Register models for main database
function registerMainModels(connection) {
  const { Schema } = mongoose;
  
  const workspaceSchema = new Schema({
    name: String,
    description: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    members: [{
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      role: String,
      joinedAt: Date
    }],
    isArchived: { type: Boolean, default: false },
    archivedAt: Date,
    archivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deleteScheduledAt: Date
  }, { timestamps: true });
  
  const projectSchema = new Schema({
    title: String,
    workspace: { type: Schema.Types.ObjectId, ref: 'Workspace' },
    projectHead: { type: Schema.Types.ObjectId, ref: 'User' },
    status: String,
    isActive: { type: Boolean, default: true },
    totalTasks: Number,
    completedTasks: Number,
    endDate: Date
  }, { timestamps: true });
  
  const taskSchema = new Schema({
    title: String,
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    assignee: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { 
      type: String, 
      enum: ['to-do', 'in-progress', 'done'],
      default: 'to-do'
    },
    isActive: { type: Boolean, default: true }
  }, { timestamps: true });
  
  const userSchema = new Schema({
    firstName: String,
    lastName: String,
    email: String,
    workspaces: [{ type: Schema.Types.ObjectId, ref: 'Workspace' }]
  }, { timestamps: true });
  
  connection.model('Workspace', workspaceSchema);
  connection.model('Project', projectSchema);
  connection.model('Task', taskSchema);
  connection.model('User', userSchema);
}

// Register models for reporting database
function registerReportingModels(connection) {
  const { Schema } = mongoose;
  
  const workspaceSummarySchema = new Schema({
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
      projectId: { type: Schema.Types.ObjectId, required: true },
      projectName: { type: String, required: true }
    }],
    workloadDistribution: [{
      userId: { type: Schema.Types.ObjectId, required: true },
      userName: { type: String, required: true },
      openTaskCount: { type: Number, required: true, default: 0 }
    }],
    lastUpdatedAt: {
      type: Date,
      required: true,
      default: Date.now
    }
  }, { 
    timestamps: true,
    collection: 'workspace_summaries'
  });
  
  const projectLeaderboardSchema = new Schema({
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
  }, {
    timestamps: true,
    collection: 'project_leaderboard'
  });
  
  projectLeaderboardSchema.index({ completionPercentage: 1, dueDate: 1 });
  
  connection.model('WorkspaceSummary', workspaceSummarySchema);
  connection.model('ProjectLeaderboard', projectLeaderboardSchema);

  // ✅ UPDATED: Employee Performance Snapshot Schema with userName and workspaceId
  const employeePerformanceSnapshotSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userName: { type: String, default: '' },  // ✅ ADDED
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', index: true },  // ✅ ADDED
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
      // ✅ REMOVED: inWorkspace field (causes conflicts)
      totalInWorkspace: { type: Number, default: 0 },
      percentile: { type: Number, default: 0 },
      rank: { type: Number, default: 0 }
    },
    trends: {
      tasksCompletedChange: { type: Number, default: 0 },
      approvalRateChange: { type: Number, default: 0 },
      productivityScoreChange: { type: Number, default: 0 }
    }
  }, { 
    timestamps: true, 
    collection: 'employeeperformancesnapshots'  // ✅ Match your actual collection name
  });
  
  // ✅ UPDATED: Add indexes for efficient querying
  employeePerformanceSnapshotSchema.index({ userId: 1, period: 1, snapshotDate: -1 });
  employeePerformanceSnapshotSchema.index({ workspaceId: 1, period: 1, snapshotDate: -1 });
  employeePerformanceSnapshotSchema.index({ snapshotDate: -1, period: 1 });
  
  connection.model('EmployeePerformanceSnapshot', employeePerformanceSnapshotSchema);
}

// Schedule the aggregation job
const schedulePattern = process.env.CRON_SCHEDULE || '0 7-12 * * *';
const employeeSchedule = '0 */6 * * *';  // ✅ CHANGED: Every 6 hours instead of every hour

console.log(`🕒 Analytics Worker: Workspace aggregation scheduled: ${schedulePattern}`);
console.log(`🕒 Analytics Worker: Employee aggregation scheduled: ${employeeSchedule} (every 6 hours)`);

const job = cron.schedule(schedulePattern, async () => {
  console.log(`⏰ [${new Date().toISOString()}] Running scheduled analytics aggregation...`);
  
  try {
    await aggregateAnalytics(mainDB, reportingDB);
    console.log(`✅ [${new Date().toISOString()}] Analytics aggregation completed successfully`);
  } catch (error) {
    console.error(`❌ [${new Date().toISOString()}] Analytics aggregation failed:`, error.message);
  }
});

// ✅ Employee aggregation every 6 hours
const employeeJob = cron.schedule(employeeSchedule, async () => {
  console.log(`⏰ [${new Date().toISOString()}] Running 6-hourly employee aggregation...`);
  try {
    await aggregateAllEmployees(mainDB, reportingDB);
    console.log(`✅ [${new Date().toISOString()}] Employee aggregation completed`);
  } catch (error) {
    console.error(`❌ [${new Date().toISOString()}] Employee aggregation failed:`, error.message);
  }
});

console.log('🚀 Analytics Worker Service started successfully');
console.log('⏳ Waiting for scheduled execution...');

// Keep the process alive - CRITICAL!
process.stdin.resume();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n🛑 Analytics Worker: Shutting down gracefully...');
  job.stop();
  employeeJob.stop();
  await mainDB.close();
  await reportingDB.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Analytics Worker: Shutting down gracefully...');
  job.stop();
  employeeJob.stop();
  await mainDB.close();
  await reportingDB.close();
  process.exit(0);
});