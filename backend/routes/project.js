import express from 'express';
import { authenticateToken } from '../libs/auth-middleware.js';
import {
  createProject,
  getWorkspaceProjects,
  getProjectDetails,
  getWorkspaceMembers,
  updateProject,
  deleteProject,
  addMemberToCategory,
  removeMemberFromCategory,
  changeMemberRoleInProject,
  getUserProjectRole,
  getProjectStatisticsOverview,
  getRecentProjects
} from '../controllers/project-controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Projects
 *   description: Project management
 */

router.use(authenticateToken);

/**
 * @swagger
 * /projects/statistics/overview:
 *   get:
 *     summary: Get project statistics overview for dashboard
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Project statistics including total, ongoing, completed, and proposed counts.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalProjects:
 *                   type: number
 *                 ongoingProjects:
 *                   type: number
 *                 completedProjects:
 *                   type: number
 *                 proposedProjects:
 *                   type: number
 *                 projectsByStatus:
 *                   type: object
 *                   properties:
 *                     ongoing:
 *                       type: number
 *                     completed:
 *                       type: number
 *                     proposed:
 *                       type: number
 *       401:
 *         description: Unauthorized.
 */
router.get('/statistics/overview', getProjectStatisticsOverview);

/**
 * @swagger
 * /projects/recent:
 *   get:
 *     summary: Get recent projects with filtering options
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ongoing, completed, proposed]
 *         description: Filter by project status
 *       - in: query
 *         name: projectType
 *         schema:
 *           type: string
 *         description: Filter by project type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 25
 *         description: Number of results to return
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Sort field
 *     responses:
 *       200:
 *         description: List of recent projects with filtering applied.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 projects:
 *                   type: array
 *                   items:
 *                     type: object
 *                 totalCount:
 *                   type: number
 *                 userRole:
 *                   type: string
 *       401:
 *         description: Unauthorized.
 */
router.get('/recent', getRecentProjects);

/**
 * @swagger
 * /projects/members:
 *   get:
 *     summary: Get all members of the current workspace
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of workspace members.
 *       401:
 *         description: Unauthorized.
 */
router.get('/members', getWorkspaceMembers);

/**
 * @swagger
 * /projects:
 *   post:
 *     summary: Create a new project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - categories
 *             properties:
 *               title:
 *                 type: string
 *                 description: The title of the project.
 *               description:
 *                 type: string
 *                 description: A description of the project.
 *               status:
 *                 type: string
 *                 description: The status of the project.
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: The start date of the project.
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: The end date of the project.
 *               categories:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     members:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           email:
 *                             type: string
 *                           role:
 *                             type: string
 *     responses:
 *       201:
 *         description: Project created successfully.
 *       400:
 *         description: Bad request.
 *       401:
 *         description: Unauthorized.
 */
router.post('/', createProject);

/**
 * @swagger
 * /projects:
 *   get:
 *     summary: Get all projects in the current workspace
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of projects.
 *       401:
 *         description: Unauthorized.
 */
router.get('/', getWorkspaceProjects);

/**
 * @swagger
 * /projects/{projectId}:
 *   get:
 *     summary: Get details of a specific project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the project.
 *     responses:
 *       200:
 *         description: Project details.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Project not found.
 */
router.get('/:projectId', getProjectDetails);

/**
 * @swagger
 * /projects/{projectId}:
 *   put:
 *     summary: Update a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the project.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Project updated successfully.
 *       400:
 *         description: Bad request.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Project not found.
 */
router.put('/:projectId', updateProject);

/**
 * @swagger
 * /projects/{projectId}:
 *   delete:
 *     summary: Delete a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the project.
 *     responses:
 *       200:
 *         description: Project deleted successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Project not found.
 */
router.delete('/:projectId', deleteProject);

/**
 * @swagger
 * /projects/{projectId}/role:
 *   get:
 *     summary: Get the current user's role in a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the project.
 *     responses:
 *       200:
 *         description: The user's role in the project.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Project not found.
 */
router.get('/:projectId/role', getUserProjectRole);

/**
 * @swagger
 * /projects/{projectId}/members:
 *   post:
 *     summary: Add a member to a project category
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the project.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - categoryName
 *               - memberEmail
 *             properties:
 *               categoryName:
 *                 type: string
 *               memberEmail:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       200:
 *         description: Member added successfully.
 *       400:
 *         description: Bad request.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Project or member not found.
 */
router.post('/:projectId/members', addMemberToCategory);

/**
 * @swagger
 * /projects/{projectId}/members:
 *   delete:
 *     summary: Remove a member from a project category
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the project.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - categoryName
 *               - memberId
 *             properties:
 *               categoryName:
 *                 type: string
 *               memberId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Member removed successfully.
 *       400:
 *         description: Bad request.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Project or member not found.
 */
router.delete('/:projectId/members', removeMemberFromCategory);

/**
 * @swagger
 * /projects/{projectId}/categories/{categoryName}/members/{memberId}/role:
 *   patch:
 *     summary: Change a member's role in a project category
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: categoryName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newRole
 *             properties:
 *               newRole:
 *                 type: string
 *     responses:
 *       200:
 *         description: Member role changed successfully.
 *       400:
 *         description: Bad request.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Project, category, or member not found.
 */
router.patch('/:projectId/categories/:categoryName/members/:memberId/role', changeMemberRoleInProject);

export default router;
