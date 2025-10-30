import express from 'express';
import { authenticateToken } from '../libs/auth-middleware.js';
import {
  createWorkspace,
  getUserWorkspaces,
  switchWorkspace,
  getUserTasks,
  getWorkspaceDetails,
  inviteMember,
  acceptInvite,
  getCurrentWorkspace,
  getWorkspaces,
  updateWorkspace,
  removeMember,
  changeMemberRole,
  transferWorkspace,
  deleteWorkspace,
  getAllWorkspaceTasks  // ✅ Add this
} from '../controllers/workspace-controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Workspaces
 *   description: Workspace management
 */

// All routes require authentication
router.use(authenticateToken);

/**
 * @swagger
 * /workspaces:
 *   post:
 *     summary: Create a new workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the workspace.
 *               description:
 *                 type: string
 *                 description: A description of the workspace.
 *     responses:
 *       201:
 *         description: Workspace created successfully.
 *       400:
 *         description: Bad request.
 *       401:
 *         description: Unauthorized.
 */
router.post('/', createWorkspace);

/**
 * @swagger
 * /workspaces:
 *   get:
 *     summary: Get all workspaces for the current user
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of workspaces.
 *       401:
 *         description: Unauthorized.
 */
router.get('/', getWorkspaces);
/**
 * @swagger
 * /workspaces/switch:
 *   post:
 *     summary: Switch the current workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workspaceId
 *             properties:
 *               workspaceId:
 *                 type: string
 *                 description: The ID of the workspace to switch to.
 *     responses:
 *       200:
 *         description: Workspace switched successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Workspace not found.
 */
router.post('/switch', switchWorkspace);

/**
 * @swagger
 * /workspaces/tasks:
 *   get:
 *     summary: Get tasks for the current user in the current workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of tasks.
 *       401:
 *         description: Unauthorized.
 */
router.get('/tasks', getUserTasks);

/**
 * @swagger
 * /workspaces/invite/accept/{token}:
 *   post:
 *     summary: Accept a workspace invitation
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The invitation token.
 *     responses:
 *       200:
 *         description: Invitation accepted successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Invitation not found.
 */
router.post('/invite/accept/:token', acceptInvite);

/**
 * @swagger
 * /workspaces/{workspaceId}/invite:
 *   post:
 *     summary: Invite a member to a workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workspace.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 description: The email of the user to invite.
 *               role:
 *                 type: string
 *                 description: The role of the user in the workspace.
 *     responses:
 *       200:
 *         description: Invitation sent successfully.
 *       400:
 *         description: Bad request.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Workspace not found.
 */
router.post('/:workspaceId/invite', inviteMember);
/**
 * @swagger
 * /workspaces/current:
 *   get:
 *     summary: Get the current workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The current workspace.
 *       401:
 *         description: Unauthorized.
 */
router.get('/current', getCurrentWorkspace);

/**
 * @swagger
 * /workspaces/all-tasks:
 *   get:
 *     summary: Get all tasks in the current workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of tasks.
 *       401:
 *         description: Unauthorized.
 */
router.get('/all-tasks', getAllWorkspaceTasks);  // ✅ Add this route

/**
 * @swagger
 * /workspaces/{workspaceId}:
 *   get:
 *     summary: Get workspace details
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workspace.
 *     responses:
 *       200:
 *         description: Workspace details.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Workspace'
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Workspace not found.
 */
router.get('/:workspaceId', getWorkspaceDetails);

// ✅ NEW CRUD ROUTES
/**
 * @swagger
 * /workspaces/{workspaceId}:
 *   put:
 *     summary: Update a workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workspace.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the workspace.
 *               description:
 *                 type: string
 *                 description: A description of the workspace.
 *     responses:
 *       200:
 *         description: Workspace updated successfully.
 *       400:
 *         description: Bad request.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Workspace not found.
 */
router.put('/:workspaceId', updateWorkspace);                              // Update workspace

/**
 * @swagger
 * /workspaces/{workspaceId}:
 *   delete:
 *     summary: Delete a workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workspace.
 *     responses:
 *       200:
 *         description: Workspace deleted successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Workspace not found.
 */
router.delete('/:workspaceId', deleteWorkspace);                          // Delete workspace

/**
 * @swagger
 * /workspaces/{workspaceId}/transfer:
 *   post:
 *     summary: Transfer ownership of a workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workspace.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newOwnerId
 *             properties:
 *               newOwnerId:
 *                 type: string
 *                 description: The ID of the new owner.
 *     responses:
 *       200:
 *         description: Workspace ownership transferred successfully.
 *       400:
 *         description: Bad request.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Workspace not found.
 */
router.post('/:workspaceId/transfer', transferWorkspace);                 // Transfer ownership

/**
 * @swagger
 * /workspaces/{workspaceId}/members/{userId}:
 *   delete:
 *     summary: Remove a member from a workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workspace.
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user to remove.
 *     responses:
 *       200:
 *         description: Member removed successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Workspace or member not found.
 */
router.delete('/:workspaceId/members/:userId', removeMember);             // Remove member

/**
 * @swagger
 * /workspaces/{workspaceId}/members/{userId}/role:
 *   patch:
 *     summary: Change a member's role in a workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workspace.
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user.
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
 *                 description: The new role for the user.
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
 *         description: Workspace or member not found.
 */
router.patch('/:workspaceId/members/:userId/role', changeMemberRole);     // ✅ NEW: Change member role

export default router;
