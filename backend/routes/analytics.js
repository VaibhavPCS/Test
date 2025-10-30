import express from 'express';
import { authenticateToken } from '../libs/auth-middleware.js';
import { getProjectAnalytics } from '../controllers/analytics-controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Analytics for projects
 */

router.use(authenticateToken);

/**
 * @swagger
 * /analytics/project/{projectId}:
 *   get:
 *     summary: Get analytics for a project
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Project analytics.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Project not found.
 */
router.get('/project/:projectId', getProjectAnalytics);

export default router;
