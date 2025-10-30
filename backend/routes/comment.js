import express from 'express';
import upload from '../libs/upload-middleware.js';
import { authenticateToken } from '../libs/auth-middleware.js';
import {
    createComment,
    getTaskComments,
    getCommentReplies,
    updateComment,
    deleteComment
} from '../controllers/comment-controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Comments
 *   description: Comment management
 */

router.use(authenticateToken);

/**
 * @swagger
 * /comments:
 *   post:
 *     summary: Create a new comment or reply
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *               taskId:
 *                 type: string
 *               parentCommentId:
 *                 type: string
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Comment created successfully.
 *       400:
 *         description: Bad request.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Task or parent comment not found.
 */
router.post('/', upload.array('attachments', 3), createComment);

/**
 * @swagger
 * /comments/task/{taskId}:
 *   get:
 *     summary: Get all comments for a task
 *     tags: [Comments]
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
 *         description: A list of comments.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Task not found.
 */
router.get('/task/:taskId', getTaskComments);

/**
 * @swagger
 * /comments/{commentId}/replies:
 *   get:
 *     summary: Get all replies for a comment
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of replies.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Comment not found.
 */
router.get('/:commentId/replies', getCommentReplies);

/**
 * @swagger
 * /comments/{commentId}:
 *   put:
 *     summary: Update a comment
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
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
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Comment updated successfully.
 *       400:
 *         description: Bad request.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Comment not found.
 */
router.put('/:commentId', updateComment);

/**
 * @swagger
 * /comments/{commentId}:
 *   delete:
 *     summary: Delete a comment
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Comment deleted successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Comment not found.
 */
router.delete('/:commentId', deleteComment);

export default router;
