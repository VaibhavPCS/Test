import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { aggregateAnalytics } from './jobs/aggregateAnalytics.js';

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

// Register models for main database
function registerMainModels(connection) {
  const { Schema } = mongoose;
  
  // Workspace schema - Uses isArchived not isActive
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
  
  // Project schema  
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
  
  // Task schema - Uses 'to-do', 'in-progress', 'done'
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
  
  // User schema
  const userSchema = new Schema({
    name: String,
    email: String
  }, { timestamps: true });
  
  connection.model('Workspace', workspaceSchema);
  connection.model('Project', projectSchema);
  connection.model('Task', taskSchema);
  connection.model('User', userSchema);
}

// Register models for reporting database
function registerReportingModels(connection) {
  const { Schema } = mongoose;
  
  // WorkspaceSummary schema
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
  
  // ProjectLeaderboard schema
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
}

// Wait for connections and run test
async function runTest() {
  try {
    console.log('🔌 Connecting to databases...');
    
    // Wait for both connections
    await Promise.all([
      new Promise((resolve) => mainDB.once('connected', resolve)),
      new Promise((resolve) => reportingDB.once('connected', resolve))
    ]);
    
    console.log('✅ Both databases connected');
    
    // Register models
    registerMainModels(mainDB);
    registerReportingModels(reportingDB);
    console.log('✅ Models registered');
    
    // Run aggregation
    console.log('\n🚀 Starting aggregation test...\n');
    await aggregateAnalytics(mainDB, reportingDB);
    console.log('\n✅ Aggregation test completed!\n');
    
    // Check workspace summaries
    const WorkspaceSummary = reportingDB.model('WorkspaceSummary');
    const summaries = await WorkspaceSummary.find({});
    console.log(`📊 Workspace Summaries: ${summaries.length} created/updated`);
    
    // Check project leaderboard
    const ProjectLeaderboard = reportingDB.model('ProjectLeaderboard');
    const leaderboard = await ProjectLeaderboard.find({});
    console.log(`📊 Leaderboard Entries: ${leaderboard.length} created/updated`);
    
    if (summaries.length > 0) {
      console.log('\nSample workspace summary:');
      console.log(JSON.stringify(summaries[0], null, 2));
    }
    
    if (leaderboard.length > 0) {
      console.log('\nSample leaderboard entry:');
      console.log(JSON.stringify(leaderboard[0], null, 2));
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Close connections
    await mainDB.close();
    await reportingDB.close();
    console.log('\n🔌 Database connections closed');
    process.exit(0);
  }
}

runTest();
