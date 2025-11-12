import express from 'express';
import { authenticateToken } from '../libs/auth-middleware.js';
import { adminOnly } from '../middleware/admin-only.js';
import { 
  getProjectAnalytics,
  getWorkspaceIntelligence,
  getProjectLeaderboard,
  refreshAnalytics,
  getUserProductivityStats,
  getTaskLifecycle,
  getProjectDateChanges,
  getEmployeePerformance,
  getAllEmployees
} from '../controllers/analytics-controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Analytics for projects, workspaces, and leaderboards
 */

router.use(authenticateToken);

/**
 * @swagger
 * /analytics/project/{projectId}:
 *   get:
 *     summary: Get Project-Level Analytics (Velocity Chart Data)
 *     description: |
 *       Fetches analytics data for a single project, including:
 *       - Task completion metrics
 *       - Velocity trends (weekly, monthly)
 *       - Status and priority distribution
 *       - Average completion time by priority
 *       - Overdue task analysis
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         description: The ID of the project
 *         schema:
 *           type: string
 *           example: "690c7a36161091d96b994f4d"
 *       - in: query
 *         name: startDate
 *         description: Start date for filtering analytics data (YYYY-MM-DD)
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-11-01"
 *       - in: query
 *         name: endDate
 *         description: End date for filtering analytics data (YYYY-MM-DD)
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-11-30"
 *     responses:
 *       200:
 *         description: Project analytics data successfully retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 analytics:
 *                   type: object
 *                   properties:
 *                     overall:
 *                       type: object
 *                       description: Overall project analytics
 *                       properties:
 *                         totalTasks:
 *                           type: integer
 *                           example: 25
 *                         completedTasks:
 *                           type: integer
 *                           example: 15
 *                         completionRate:
 *                           type: number
 *                           format: float
 *                           example: 60.0
 *                         averageDuration:
 *                           type: number
 *                           format: float
 *                           description: Average task duration in days
 *                           example: 3.5
 *                         velocity:
 *                           type: object
 *                           properties:
 *                             weekly:
 *                               type: integer
 *                               description: Tasks completed in last 7 days
 *                               example: 5
 *                             monthly:
 *                               type: integer
 *                               description: Tasks completed in last 30 days
 *                               example: 15
 *                         overdueTasks:
 *                           type: integer
 *                           example: 2
 *                         overduePercentage:
 *                           type: number
 *                           format: float
 *                           example: 8.0
 *                         statusDistribution:
 *                           type: object
 *                           properties:
 *                             to-do:
 *                               type: integer
 *                               example: 5
 *                             in-progress:
 *                               type: integer
 *                               example: 5
 *                             done:
 *                               type: integer
 *                               example: 15
 *                         priorityDistribution:
 *                           type: object
 *                           properties:
 *                             low:
 *                               type: integer
 *                               example: 8
 *                             medium:
 *                               type: integer
 *                               example: 12
 *                             high:
 *                               type: integer
 *                               example: 5
 *                         completionTimeByPriority:
 *                           type: object
 *                           description: Average completion time in days by priority
 *                           properties:
 *                             low:
 *                               type: number
 *                               format: float
 *                               example: 4.5
 *                             medium:
 *                               type: number
 *                               format: float
 *                               example: 3.2
 *                             high:
 *                               type: number
 *                               format: float
 *                               example: 2.1
 *                     categories:
 *                       type: object
 *                       description: Analytics broken down by project categories
 *                       additionalProperties:
 *                         type: object
 *                         description: Same structure as overall analytics
 *                 project:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "690c7a36161091d96b994f4d"
 *                     title:
 *                       type: string
 *                       example: "Test-2"
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Development", "Testing"]
 *                 totalTasks:
 *                   type: integer
 *                   example: 25
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - User does not have access to this project
 *       404:
 *         description: Project not found
 *       500:
 *         description: Internal Server Error
 */
router.get('/project/:projectId', getProjectAnalytics);


/**
 * @swagger
 * /analytics/workspace/{workspaceId}:
 *   get:
 *     summary: Get workspace intelligence data
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Workspace intelligence data.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Data not available yet.
 */
router.get('/workspace/:workspaceId', getWorkspaceIntelligence);

/**
 * @swagger
 * /analytics/leaderboard:
 *   get:
 *     summary: Get project leaderboard
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Project leaderboard data.
 *       401:
 *         description: Unauthorized.
 */
router.get('/leaderboard', getProjectLeaderboard);

/**
 * @swagger
 * /analytics/refresh:
 *   post:
 *     summary: Trigger manual analytics refresh (Admin only)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       202:
 *         description: Refresh queued.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Admin access required.
 */
router.post('/refresh', refreshAnalytics);

/**
 * @swagger
 * /analytics/user/{userId}:
 *   get:
 *     summary: Get Personal Productivity Statistics
 *     description: |
 *       Fetches real-time productivity stats for a specific user, including:
 *       - Count of open tasks (to-do and in-progress)
 *       - List of tasks due in the next 7 days
 *       - Count of tasks completed in the last 7 days
 *       
 *       **Authorization:** Users can only request their own data.
 *       Data is calculated in real-time from the main application database.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         description: The ID of the user (must match authenticated user)
 *         schema:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: User productivity statistics successfully retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 openTaskCount:
 *                   type: integer
 *                   description: Number of open tasks (to-do or in-progress)
 *                   example: 12
 *                 tasksDueNext7Days:
 *                   type: array
 *                   description: Tasks due within the next 7 days
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "507f1f77bcf86cd799439011"
 *                       title:
 *                         type: string
 *                         example: "Complete user authentication feature"
 *                       dueDate:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-11-15T10:00:00.000Z"
 *                       priority:
 *                         type: string
 *                         enum: [low, medium, high, urgent]
 *                         example: "high"
 *                       status:
 *                         type: string
 *                         enum: [to-do, in-progress]
 *                         example: "in-progress"
 *                       projectTitle:
 *                         type: string
 *                         example: "Authentication Module"
 *                 tasksCompletedLast7Days:
 *                   type: integer
 *                   description: Number of tasks completed in the last 7 days
 *                   example: 8
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Users can only access their own data
 *       500:
 *         description: Internal Server Error
 */
/**
 * @swagger
 * /analytics/task/{taskId}/lifecycle:
 *   get:
 *     summary: Get Task Lifecycle Timeline and Metrics
 *     description: |
 *       Retrieves the complete lifecycle history of a task, including:
 *       - Timeline of all events (created, assigned, started, completed, approved, rejected, etc.)
 *       - Lifecycle metrics (duration, rejection count, approval attempts, reassignments)
 *       - Populated actor information for each event
 *       
 *       **Access Control:** Creator, assignee, project lead, or admin only.
 *       **Data Source:** TaskHistory collection (Epic 3, Story 3.1).
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         description: The MongoDB ObjectId of the task
 *         schema:
 *           type: string
 *           example: "673320a3d9e1a72e18a7effc"
 *       - in: query
 *         name: page
 *         description: Page number for pagination
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *           example: 1
 *       - in: query
 *         name: limit
 *         description: Number of events per page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *           example: 50
 *     responses:
 *       200:
 *         description: Task lifecycle data successfully retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 taskId:
 *                   type: string
 *                   example: "673320a3d9e1a72e18a7effc"
 *                 taskTitle:
 *                   type: string
 *                   example: "Implement user authentication"
 *                 timeline:
 *                   type: array
 *                   description: Chronological list of task events (sorted by timestamp DESC)
 *                   items:
 *                     type: object
 *                     properties:
 *                       eventType:
 *                         type: string
 *                         enum: [created, assigned, reassigned, started, completed, submitted_for_approval, approved, rejected, reopened, status_changed, due_date_changed, priority_changed]
 *                         example: "approved"
 *                       actor:
 *                         type: object
 *                         description: User who performed the action
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "67330bba5f9a62a88d4d3e45"
 *                           name:
 *                             type: string
 *                             example: "John Doe"
 *                           email:
 *                             type: string
 *                             example: "john@example.com"
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-11-12T10:30:00.000Z"
 *                       changes:
 *                         type: object
 *                         description: What changed in this event
 *                         properties:
 *                           field:
 *                             type: string
 *                             example: "status"
 *                           oldValue:
 *                             type: string
 *                             nullable: true
 *                             example: "in-progress"
 *                           newValue:
 *                             type: string
 *                             example: "done"
 *                       metadata:
 *                         type: object
 *                         description: Additional event-specific data
 *                         example: { "reason": "All requirements met" }
 *                 metrics:
 *                   type: object
 *                   description: Calculated lifecycle metrics
 *                   properties:
 *                     totalDuration:
 *                       type: number
 *                       description: Total time from creation to completion (hours)
 *                       example: 72.5
 *                     workingDuration:
 *                       type: number
 *                       description: Active working time (started to completed, hours)
 *                       example: 48.0
 *                     rejectionCount:
 *                       type: integer
 *                       description: Number of times task was rejected
 *                       example: 2
 *                     approvalAttempts:
 *                       type: integer
 *                       description: Number of times task was submitted for approval
 *                       example: 3
 *                     reassignments:
 *                       type: integer
 *                       description: Number of times task was reassigned
 *                       example: 1
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 50
 *                     total:
 *                       type: integer
 *                       description: Total number of events
 *                       example: 15
 *                     hasMore:
 *                       type: boolean
 *                       description: Whether there are more events to load
 *                       example: false
 *       400:
 *         description: Bad Request - Invalid task ID format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invalid task ID"
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - User does not have access to this task
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Access denied"
 *       404:
 *         description: Task not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Task not found"
 *       500:
 *         description: Internal Server Error
 */
router.get('/task/:taskId/lifecycle', getTaskLifecycle);

/**
 * @swagger
 * /analytics/project/{projectId}/date-changes:
 *   get:
 *     summary: Get Project Date Change History
 *     description: |
 *       Retrieves the history of start date and end date changes for a project, including:
 *       - All date change events with reasons
 *       - Calculated delay days for each change
 *       - Summary metrics (total extensions, total delay days)
 *       
 *       **Access Control:** Project lead or admin only.
 *       **Data Source:** ProjectHistory collection (Epic 3, Story 3.2).
 *       **Use Case:** Track project timeline extensions and delays for reporting.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         description: The MongoDB ObjectId of the project
 *         schema:
 *           type: string
 *           example: "673320a3d9e1a72e18a7f000"
 *     responses:
 *       200:
 *         description: Project date change history successfully retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 projectId:
 *                   type: string
 *                   example: "673320a3d9e1a72e18a7f000"
 *                 projectTitle:
 *                   type: string
 *                   example: "Authentication Module"
 *                 dateChanges:
 *                   type: array
 *                   description: List of date change events (sorted by timestamp DESC)
 *                   items:
 *                     type: object
 *                     properties:
 *                       field:
 *                         type: string
 *                         enum: [startDate, endDate]
 *                         example: "endDate"
 *                       oldValue:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                         example: "2025-11-15T00:00:00.000Z"
 *                       newValue:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-11-30T00:00:00.000Z"
 *                       changedBy:
 *                         type: object
 *                         description: User who made the change
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "67330bba5f9a62a88d4d3e45"
 *                           name:
 *                             type: string
 *                             example: "Jane Smith"
 *                           email:
 *                             type: string
 *                             example: "jane@example.com"
 *                       changedAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-11-12T10:00:00.000Z"
 *                       reason:
 *                         type: string
 *                         description: Reason for the date change
 *                         example: "Client requested extension"
 *                       delayDays:
 *                         type: integer
 *                         description: Number of days the deadline was extended (0 if moved earlier)
 *                         example: 15
 *                 summary:
 *                   type: object
 *                   description: Aggregated metrics for date changes
 *                   properties:
 *                     totalExtensions:
 *                       type: integer
 *                       description: Number of times the end date was extended
 *                       example: 3
 *                     totalDelayDays:
 *                       type: integer
 *                       description: Total number of days the project was delayed
 *                       example: 45
 *       400:
 *         description: Bad Request - Invalid project ID format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invalid project ID"
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - User is not project lead or admin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Access denied"
 *       404:
 *         description: Project not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Project not found"
 *       500:
 *         description: Internal Server Error
 */
router.get('/project/:projectId/date-changes', getProjectDateChanges);

/**
 * @swagger
 * /analytics/employee/{userId}/performance:
 *   get:
 *     summary: Get Employee Performance Snapshots (Admin Only)
 *     description: |
 *       Retrieves employee performance metrics over time, including:
 *       - Task completion metrics (total, completed, approval rate, productivity score)
 *       - Time metrics (avg time to start, complete, approval)
 *       - Quality metrics (rejection rate, rework rate, on-time completion)
 *       - Project involvement breakdown
 *       - Workspace rankings and percentiles
 *       - Performance trends (change from previous period)
 *       
 *       **Access Control:** Admin/Super Admin only.
 *       **Data Source:** EmployeePerformanceSnapshot collection (Epic 3, Story 3.4).
 *       **Aggregation:** Data is pre-aggregated by background worker (hourly cron job).
 *       **Productivity Score Formula (BL7):** (approvalRate×0.4) + (onTimeRate×0.3) + (velocity×0.2) + (qualityScore×0.1)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         description: The MongoDB ObjectId of the employee
 *         schema:
 *           type: string
 *           example: "67330bba5f9a62a88d4d3e45"
 *       - in: query
 *         name: period
 *         description: Aggregation period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: daily
 *           example: "daily"
 *       - in: query
 *         name: startDate
 *         description: Filter snapshots from this date (YYYY-MM-DD)
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-11-01"
 *       - in: query
 *         name: endDate
 *         description: Filter snapshots until this date (YYYY-MM-DD)
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-11-12"
 *     responses:
 *       200:
 *         description: Employee performance data successfully retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                   example: "67330bba5f9a62a88d4d3e45"
 *                 period:
 *                   type: string
 *                   example: "daily"
 *                 snapshots:
 *                   type: array
 *                   description: List of performance snapshots (sorted by date DESC)
 *                   items:
 *                     type: object
 *                     properties:
 *                       snapshotDate:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-11-12T00:00:00.000Z"
 *                       metrics:
 *                         type: object
 *                         description: All 17+ performance metrics
 *                         properties:
 *                           total:
 *                             type: integer
 *                             example: 10
 *                           completed:
 *                             type: integer
 *                             example: 8
 *                           todo:
 *                             type: integer
 *                             example: 1
 *                           inProgress:
 *                             type: integer
 *                             example: 1
 *                           overdue:
 *                             type: integer
 *                             example: 0
 *                           approved:
 *                             type: integer
 *                             example: 7
 *                           rejected:
 *                             type: integer
 *                             example: 1
 *                           pendingApproval:
 *                             type: integer
 *                             example: 0
 *                           approvalRate:
 *                             type: number
 *                             format: float
 *                             description: Percentage of approved tasks
 *                             example: 87.5
 *                           firstTimeApprovalRate:
 *                             type: number
 *                             format: float
 *                             example: 75.0
 *                           avgRejectionsPerTask:
 *                             type: number
 *                             format: float
 *                             example: 0.1
 *                           avgTimeToStart:
 *                             type: number
 *                             format: float
 *                             description: Average hours from creation to start
 *                             example: 2.5
 *                           avgTimeToComplete:
 *                             type: number
 *                             format: float
 *                             description: Average hours from creation to completion
 *                             example: 24.5
 *                           avgTimeToApproval:
 *                             type: number
 *                             format: float
 *                             description: Average hours from submission to approval
 *                             example: 4.0
 *                           totalActiveTime:
 *                             type: number
 *                             format: float
 *                             description: Total active working hours
 *                             example: 48.5
 *                           reworkRate:
 *                             type: number
 *                             format: float
 *                             description: Percentage of tasks requiring rework
 *                             example: 10.0
 *                           onTimeCompletionRate:
 *                             type: number
 *                             format: float
 *                             description: Percentage of tasks completed on time
 *                             example: 87.5
 *                           productivityScore:
 *                             type: number
 *                             format: float
 *                             description: Overall productivity score (0-100, BL7 formula)
 *                             example: 85.2
 *                       projects:
 *                         type: array
 *                         description: Project involvement breakdown
 *                         items:
 *                           type: object
 *                           properties:
 *                             projectId:
 *                               type: string
 *                               example: "673320a3d9e1a72e18a7f001"
 *                             projectName:
 *                               type: string
 *                               example: "Auth Module"
 *                             role:
 *                               type: string
 *                               example: "Developer"
 *                             tasksAssigned:
 *                               type: integer
 *                               example: 5
 *                             tasksCompleted:
 *                               type: integer
 *                               example: 4
 *                             approvalRate:
 *                               type: number
 *                               format: float
 *                               example: 80.0
 *                       rankings:
 *                         type: object
 *                         description: Workspace performance rankings
 *                         properties:
 *                           inWorkspace:
 *                             type: string
 *                             description: Workspace ID where ranked
 *                             example: "673320a3d9e1a72e18a7f002"
 *                           totalInWorkspace:
 *                             type: integer
 *                             description: Total employees in workspace
 *                             example: 10
 *                           percentile:
 *                             type: integer
 *                             description: Percentile rank (0-100, lower is better)
 *                             example: 20
 *                           rank:
 *                             type: integer
 *                             description: Absolute rank (1 = best)
 *                             example: 2
 *                       trends:
 *                         type: object
 *                         description: Change from previous period (%)
 *                         properties:
 *                           tasksCompletedChange:
 *                             type: number
 *                             format: float
 *                             example: 10.0
 *                           approvalRateChange:
 *                             type: number
 *                             format: float
 *                             example: 5.0
 *                           productivityScoreChange:
 *                             type: number
 *                             format: float
 *                             example: 2.5
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Admin access required"
 *       500:
 *         description: Internal Server Error
 */
router.get('/employee/:userId/performance', adminOnly, getEmployeePerformance);

/**
 * @swagger
 * /analytics/employees:
 *   get:
 *     summary: Get All Employees Performance List (Admin Only)
 *     description: |
 *       Retrieves a paginated, sortable list of all employees with their latest performance metrics.
 *       
 *       **Features:**
 *       - Pagination support (max 100 per page)
 *       - Sorting by any metric (productivity score, approval rate, etc.)
 *       - Filter by workspace
 *       - Returns latest snapshot for each employee
 *       
 *       **Access Control:** Admin/Super Admin only.
 *       **Data Source:** EmployeePerformanceSnapshot collection.
 *       **Use Case:** Admin dashboard to view and compare all employee performance.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: workspaceId
 *         description: Filter employees by workspace
 *         schema:
 *           type: string
 *           example: "673320a3d9e1a72e18a7f002"
 *       - in: query
 *         name: sortBy
 *         description: Field to sort by (dot notation supported)
 *         schema:
 *           type: string
 *           default: "metrics.productivityScore"
 *           example: "metrics.productivityScore"
 *       - in: query
 *         name: order
 *         description: Sort order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *           example: "desc"
 *       - in: query
 *         name: page
 *         description: Page number for pagination
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *           example: 1
 *       - in: query
 *         name: limit
 *         description: Number of employees per page (max 100)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *           example: 50
 *     responses:
 *       200:
 *         description: Employee list successfully retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 employees:
 *                   type: array
 *                   description: List of employees with latest metrics
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: string
 *                         example: "67330bba5f9a62a88d4d3e45"
 *                       userName:
 *                         type: string
 *                         example: "John Doe"
 *                       latestMetrics:
 *                         type: object
 *                         description: Most recent performance snapshot metrics
 *                         properties:
 *                           total:
 *                             type: integer
 *                             example: 10
 *                           completed:
 *                             type: integer
 *                             example: 8
 *                           productivityScore:
 *                             type: number
 *                             format: float
 *                             example: 85.2
 *                           approvalRate:
 *                             type: number
 *                             format: float
 *                             example: 87.5
 *                       rankings:
 *                         type: object
 *                         properties:
 *                           inWorkspace:
 *                             type: string
 *                             example: "673320a3d9e1a72e18a7f002"
 *                           totalInWorkspace:
 *                             type: integer
 *                             example: 10
 *                           percentile:
 *                             type: integer
 *                             example: 20
 *                           rank:
 *                             type: integer
 *                             example: 2
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 50
 *                     total:
 *                       type: integer
 *                       description: Total number of employees
 *                       example: 120
 *                     hasMore:
 *                       type: boolean
 *                       description: Whether there are more pages
 *                       example: true
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Admin access required"
 *       500:
 *         description: Internal Server Error
 */
router.get('/employees', adminOnly, getAllEmployees);


export default router;
