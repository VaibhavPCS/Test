import express from 'express';
import { authenticateToken } from '../libs/auth-middleware.js';
import upload, { uploadHandover, uploadTask } from '../libs/upload-middleware.js';
import { handleUploadErrors } from '../libs/upload-middleware.js';
import {
  createTask,
  getProjectTasks,
  getUserProjectTasks,
  updateTask,
  updateTaskStatus,
  updateHandoverNotes,
  getTaskById,
  getAssignableMembers,
  deleteTask,    // ✅ Import delete function
  approveTask,   // ✅ NEW: Import approve function
  rejectTask,    // ✅ ENHANCED: Import reject function
  reassignApprovedTask,  // ✅ NEW: Import reassign function
  uploadTaskAttachments,  // ✅ NEW: Import upload attachments function
  deleteTaskAttachment    // ✅ NEW: Import delete attachment function
} from '../controllers/task-controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Tasks
 *   description: Task management
 */

router.use(authenticateToken);

/**
 * @swagger
 * /task/{taskId}:
 *   delete:
 *     summary: Delete a task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task deleted successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Task not found.
 */
router.delete('/:taskId', deleteTask);

/**
 * @swagger
 * /task/{taskId}/handover:
 *   patch:
 *     summary: Update handover notes for a task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               handoverNotes:
 *                 type: string
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               handoverNotes:
 *                 type: string
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Handover notes updated successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Task not found.
 */
// Support multipart/form-data with attachments as well as JSON body
router.patch(
  '/:taskId/handover',
  uploadHandover.array('attachments', 3),
  handleUploadErrors,
  updateHandoverNotes
);
router.post(
  '/:taskId/handover',
  uploadHandover.array('attachments', 3),
  handleUploadErrors,
  updateHandoverNotes
);

/**
 * @swagger
 * /task/{taskId}/status:
 *   patch:
 *     summary: Update the status of a task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Task status updated successfully.
 *       400:
 *         description: Bad request.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Task not found.
 */
router.patch('/:taskId/status', updateTaskStatus);
router.post('/:taskId/status', updateTaskStatus);

/**
 * @swagger
 * /task/{taskId}/approve:
 *   post:
 *     summary: Approve a task (project head or admin only)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task approved successfully.
 *       400:
 *         description: Task is not pending approval.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Only project head or admin can approve.
 *       404:
 *         description: Task not found.
 */
router.post('/:taskId/approve', approveTask);

/**
 * @swagger
 * /task/{taskId}/reject:
 *   post:
 *     summary: Reject a task with new dates (project head or admin only)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
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
 *               - newStartDate
 *               - newDueDate
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Needs more work on the implementation
 *               newStartDate:
 *                 type: string
 *                 format: date
 *                 example: 2024-02-01
 *               newDueDate:
 *                 type: string
 *                 format: date
 *                 example: 2024-02-15
 *               reassigneeId:
 *                 type: string
 *                 example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Task rejected successfully with new dates.
 *       400:
 *         description: Task is not pending approval or invalid dates.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Only project head or admin can reject.
 *       404:
 *         description: Task not found.
 */
router.post('/:taskId/reject', rejectTask);

/**
 * @swagger
 * /task/{taskId}/reassign:
 *   post:
 *     summary: Reassign an approved task (project head or admin only)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
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
 *               - assigneeId
 *               - startDate
 *               - dueDate
 *             properties:
 *               assigneeId:
 *                 type: string
 *                 example: 507f1f77bcf86cd799439011
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: 2024-02-01
 *               dueDate:
 *                 type: string
 *                 format: date
 *                 example: 2024-02-15
 *     responses:
 *       200:
 *         description: Task reassigned successfully.
 *       400:
 *         description: Task is not approved or invalid data.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Only project head or admin can reassign.
 *       404:
 *         description: Task not found.
 */
router.post('/:taskId/reassign', reassignApprovedTask);

/**
 * @swagger
 * /task/{taskId}/attachments:
 *   post:
 *     summary: Upload attachments to an existing task (project head or admin only)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Attachments uploaded successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Only project head or admin can upload attachments.
 *       404:
 *         description: Task not found.
 */
router.post('/:taskId/attachments', uploadTask.array('attachments', 3), handleUploadErrors, uploadTaskAttachments);

/**
 * @swagger
 * /task/{taskId}/attachments/{index}:
 *   delete:
 *     summary: Delete a task attachment (project head or admin only)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: index
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Attachment deleted successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Only project head or admin can delete attachments.
 *       404:
 *         description: Task or attachment not found.
 */
router.delete('/:taskId/attachments/:index', deleteTaskAttachment);

/**
 * @swagger
 * /task/{taskId}:
 *   get:
 *     summary: Get a task by ID
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task details.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Task not found.
 */
router.get('/:taskId', getTaskById);

/**
 * @swagger
 * /task/{taskId}:
 *   put:
 *     summary: Update a task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
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
 *               priority:
 *                 type: string
 *               assigneeId:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               dueDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Task updated successfully.
 *       400:
 *         description: Bad request.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Task not found.
 */
router.put('/:taskId', updateTask);

/**
 * @swagger
 * /task:
 *   post:
 *     summary: Create a new task
 *     tags: [Tasks]
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
 *               - projectId
 *               - category
 *               - startDate
 *               - dueDate
 *             properties:
 *               title:
 *                 type: string
 *                 example: Implement user authentication
 *               description:
 *                 type: string
 *                 example: Create login and registration functionality
 *               status:
 *                 type: string
 *                 enum: ['todo', 'in-progress', 'review', 'done']
 *                 default: todo
 *               priority:
 *                 type: string
 *                 enum: ['low', 'medium', 'high', 'urgent']
 *                 default: medium
 *               assigneeId:
 *                 type: string
 *                 example: 507f1f77bcf86cd799439011
 *               projectId:
 *                 type: string
 *                 example: 507f1f77bcf86cd799439012
 *               category:
 *                 type: string
 *                 example: Development
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: 2024-01-15
 *               dueDate:
 *                 type: string
 *                 format: date
 *                 example: 2024-01-30
 *     responses:
 *       201:
 *         description: Task created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Task created successfully
 *                 task:
 *                   $ref: '#/components/schemas/Task'
 *       400:
 *         description: Bad request.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Project or assignee not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', uploadTask.array('attachments', 3), handleUploadErrors, createTask);

/**
 * @swagger
 * /task/project/{projectId}:
 *   get:
 *     summary: Get all tasks for a project
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of tasks.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Project not found.
 */
router.get('/project/:projectId', getProjectTasks);

/**
 * @swagger
 * /task/project/{projectId}/user:
 *   get:
 *     summary: Get all tasks for the current user in a project
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of tasks.
 *       401:
 *         description: Unauthorized.
 */
router.get('/project/:projectId/user', getUserProjectTasks);

/**
 * @swagger
 * /task/project/{projectId}/members:
 *   get:
 *     summary: Get assignable members for a task in a project
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of assignable members.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Project not found.
 */
router.get('/project/:projectId/members', getAssignableMembers);

export default router;
