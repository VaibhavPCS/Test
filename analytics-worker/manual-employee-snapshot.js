import dotenv from "dotenv";
import mongoose from "mongoose";
import { aggregateAllEmployees } from "./jobs/employee-aggregation.js";

dotenv.config();

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

function registerMainModels(connection) {
const { Schema } = mongoose;

const workspaceSchema = new Schema({
name: String,
description: String,
createdBy: { type: Schema.Types.ObjectId, ref: "User" },
members: [{ userId: { type: Schema.Types.ObjectId, ref: "User" }, role: String, joinedAt: Date }],
isArchived: { type: Boolean, default: false },
archivedAt: Date,
archivedBy: { type: Schema.Types.ObjectId, ref: "User" },
deleteScheduledAt: Date,
}, { timestamps: true });

const projectSchema = new Schema({
title: String,
workspace: { type: Schema.Types.ObjectId, ref: "Workspace" },
projectHead: { type: Schema.Types.ObjectId, ref: "User" },
status: String,
isActive: { type: Boolean, default: true },
totalTasks: Number,
completedTasks: Number,
endDate: Date,
}, { timestamps: true });

const taskSchema = new Schema({
title: String,
project: { type: Schema.Types.ObjectId, ref: "Project" },
assignee: { type: Schema.Types.ObjectId, ref: "User" },
status: { type: String, enum: ["to-do", "in-progress", "done"], default: "to-do" },
isActive: { type: Boolean, default: true },
}, { timestamps: true });

const taskHistorySchema = new Schema({
taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
userId: { type: Schema.Types.ObjectId, ref: "User" },
eventType: { type: String, enum: ["created", "assigned", "started", "paused", "resumed", "completed", "approved", "rejected", "status_changed", "updated"] },
previousValue: Schema.Types.Mixed,
newValue: Schema.Types.Mixed,
timestamp: { type: Date, default: Date.now },
metadata: Schema.Types.Mixed,
}, { timestamps: true });

const userSchema = new Schema({
firstName: String,
lastName: String,
name: String,
email: String,
workspaces: [{ type: Schema.Types.ObjectId, ref: "Workspace" }],
}, { timestamps: true });

connection.model("Workspace", workspaceSchema);
connection.model("Project", projectSchema);
connection.model("Task", taskSchema);
connection.model("TaskHistory", taskHistorySchema);
connection.model("User", userSchema);
}

function registerReportingModels(connection) {
const { Schema } = mongoose;

const workspaceSummarySchema = new Schema({
workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, unique: true, index: true },
overallCompletionRate: { type: Number, required: true, min: 0, max: 100, default: 0 },
activeProjects: [{ projectId: { type: Schema.Types.ObjectId, required: true }, projectName: { type: String, required: true } }],
workloadDistribution: [{ userId: { type: Schema.Types.ObjectId, required: true }, userName: { type: String, required: true }, openTaskCount: { type: Number, required: true, default: 0 } }],
lastUpdatedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true, collection: "workspace_summaries" });

const projectLeaderboardSchema = new Schema({
projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, unique: true, index: true },
projectName: { type: String, required: true, trim: true },
projectHead: { userId: { type: Schema.Types.ObjectId, ref: "User", required: true }, userName: { type: String, required: true } },
status: { type: String, enum: ["On Track", "At Risk", "Off Track", "Completed"], required: true, default: "On Track" },
completionPercentage: { type: Number, required: true, min: 0, max: 100, default: 0 },
dueDate: { type: Date, required: true },
lastUpdatedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true, collection: "project_leaderboard" });

projectLeaderboardSchema.index({ completionPercentage: 1, dueDate: 1 });

const employeePerformanceSnapshotSchema = new Schema({
userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
userName: { type: String, default: "" },
workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", index: true },
snapshotDate: { type: Date, required: true, index: true, default: Date.now },
period: { type: String, enum: ["daily", "weekly", "monthly"], required: true, index: true },
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
productivityScore: { type: Number, default: 0 },
},
projects: [{
projectId: { type: Schema.Types.ObjectId, ref: "Project" },
projectName: { type: String },
role: { type: String },
tasksAssigned: { type: Number, default: 0 },
tasksCompleted: { type: Number, default: 0 },
approvalRate: { type: Number, default: 0 },
}],
rankings: {
totalInWorkspace: { type: Number, default: 0 },
percentile: { type: Number, default: 0 },
rank: { type: Number, default: 0 },
},
trends: {
tasksCompletedChange: { type: Number, default: 0 },
approvalRateChange: { type: Number, default: 0 },
productivityScoreChange: { type: Number, default: 0 },
},
}, { timestamps: true, collection: "employeeperformancesnapshots" });

employeePerformanceSnapshotSchema.index({ userId: 1, period: 1, snapshotDate: -1 });
employeePerformanceSnapshotSchema.index({ workspaceId: 1, period: 1, snapshotDate: -1 });
employeePerformanceSnapshotSchema.index({ snapshotDate: -1, period: 1 });

connection.model("WorkspaceSummary", workspaceSummarySchema);
connection.model("ProjectLeaderboard", projectLeaderboardSchema);
connection.model("EmployeePerformanceSnapshot", employeePerformanceSnapshotSchema);
}

async function runManualSnapshot() {
try {
console.log("==========================================");
console.log("🚀 MANUAL EMPLOYEE SNAPSHOT GENERATION");
console.log("==========================================\n");
console.log("🔌 Connecting to databases...");
await Promise.all([
  new Promise((resolve, reject) => { mainDB.once("connected", resolve); mainDB.once("error", reject); }),
  new Promise((resolve, reject) => { reportingDB.once("connected", resolve); reportingDB.once("error", reject); }),
]);

console.log("✅ Main Database connected");
console.log("✅ Reporting Database connected\n");

registerMainModels(mainDB);
registerReportingModels(reportingDB);
console.log("✅ All models registered\n");

const User = mainDB.model("User");
const Task = mainDB.model("Task");
const Project = mainDB.model("Project");
const EmployeePerformanceSnapshot = reportingDB.model("EmployeePerformanceSnapshot");

const userCount = await User.countDocuments({});
const taskCount = await Task.countDocuments({ isActive: true });
const projectCount = await Project.countDocuments({ isActive: true });
const existingSnapshots = await EmployeePerformanceSnapshot.countDocuments({});

console.log("📊 DATABASE STATISTICS:");
console.log(`   👥 Total Users: ${userCount}`);
console.log(`   📋 Active Tasks: ${taskCount}`);
console.log(`   📁 Active Projects: ${projectCount}`);
console.log(`   📸 Existing Snapshots: ${existingSnapshots}\n`);

if (userCount === 0) {
  console.log("⚠️  WARNING: No users found in database!");
  console.log("   Please create users before running this script.\n");
  return;
}

const sampleUsers = await User.find({}).limit(5).select("firstName lastName email").lean();
console.log("👥 SAMPLE USERS TO PROCESS:");
sampleUsers.forEach((user, idx) => {
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.name || "Unnamed";
  console.log(`   ${idx + 1}. ${name} (${user.email || "no email"})`);
});
console.log("");

console.log("🔄 Starting employee aggregation...\n");
const startTime = Date.now();

await aggregateAllEmployees(mainDB, reportingDB);

const duration = ((Date.now() - startTime) / 1000).toFixed(2);
const newSnapshots = await EmployeePerformanceSnapshot.countDocuments({});
const snapshotsCreated = newSnapshots - existingSnapshots;

console.log("\n==========================================");
console.log("✅ AGGREGATION COMPLETED SUCCESSFULLY!");
console.log("==========================================\n");

console.log("📊 RESULTS:");
console.log(`   ⏱️  Duration: ${duration}s`);
console.log(`   📸 Snapshots Before: ${existingSnapshots}`);
console.log(`   📸 Snapshots After: ${newSnapshots}`);
console.log(`   ✨ New Snapshots Created: ${snapshotsCreated}\n`);

const sampleSnapshots = await EmployeePerformanceSnapshot.find({}).sort({ createdAt: -1 }).limit(3).lean();

if (sampleSnapshots.length > 0) {
  console.log("📸 SAMPLE SNAPSHOTS CREATED:\n");
  sampleSnapshots.forEach((snapshot, idx) => {
    console.log(`   ${idx + 1}. User: ${snapshot.userName || "Unknown"}`);
    console.log(`      Period: ${snapshot.period}`);
    console.log(`      Date: ${snapshot.snapshotDate.toISOString()}`);
    console.log(`      Total Tasks: ${snapshot.metrics?.total || 0}`);
    console.log(`      Completed: ${snapshot.metrics?.completed || 0}`);
    console.log(`      Productivity Score: ${snapshot.metrics?.productivityScore || 0}`);
    console.log(`      Rank: ${snapshot.rankings?.rank || "N/A"} / ${snapshot.rankings?.totalInWorkspace || "N/A"}`);
    console.log("");
  });
}

console.log("✅ VERIFICATION:");
const WorkspaceSummary = reportingDB.model("WorkspaceSummary");
const ProjectLeaderboard = reportingDB.model("ProjectLeaderboard");

const summaryCount = await WorkspaceSummary.countDocuments({});
const leaderboardCount = await ProjectLeaderboard.countDocuments({});

console.log(`   📊 Workspace Summaries: ${summaryCount}`);
console.log(`   📊 Project Leaderboard Entries: ${leaderboardCount}`);
console.log(`   📊 Employee Snapshots: ${newSnapshots}\n`);

console.log("==========================================");
console.log("🎉 MANUAL SNAPSHOT GENERATION COMPLETE!");
console.log("==========================================\n");
} catch (error) {
console.error("\n❌ MANUAL SNAPSHOT FAILED:");
console.error(error);
console.error("\nStack trace:", error.stack);
} finally {
console.log("🔌 Closing database connections...");
await mainDB.close();
await reportingDB.close();
console.log("✅ Database connections closed\n");
process.exit(0);
}
}

runManualSnapshot();