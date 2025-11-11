import express from 'express';
import { authenticateToken } from '../libs/auth-middleware.js';
import { 
  getProjectAnalytics,
  getWorkspaceIntelligence,
  getProjectLeaderboard,
  refreshAnalytics
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

export default router;
