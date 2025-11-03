import express from 'express';
import { 
  createMeeting, 
  getMeetingsByWorkspace, 
  getMeetingById, 
  updateMeeting, 
  deleteMeeting,
  updateParticipantResponse
} from '../controllers/meeting-controller.js';
import { authenticateToken } from '../libs/auth-middleware.js';
import { uploadMeetings, handleUploadErrors } from '../libs/upload-middleware.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Use the meeting upload middleware

/**
 * @swagger
 * components:
 *   schemas:
 *     Meeting:
 *       type: object
 *       required:
 *         - title
 *         - scheduledDate
 *         - organizer
 *         - workspace
 *       properties:
 *         _id:
 *           type: string
 *           description: The auto-generated id of the meeting
 *         title:
 *           type: string
 *           description: The meeting title
 *         description:
 *           type: string
 *           description: The meeting description
 *         scheduledDate:
 *           type: string
 *           format: date-time
 *           description: The scheduled date and time of the meeting
 *         duration:
 *           type: number
 *           description: Duration in minutes
 *           default: 60
 *         meetingLink:
 *           type: string
 *           description: URL for the meeting
 *         organizer:
 *           type: string
 *           description: ID of the meeting organizer
 *         participants:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               user:
 *                 type: string
 *                 description: User ID
 *               status:
 *                 type: string
 *                 enum: [invited, accepted, declined, tentative]
 *               responseDate:
 *                 type: string
 *                 format: date-time
 *         workspace:
 *           type: string
 *           description: ID of the workspace
 *         project:
 *           type: string
 *           description: ID of the project (optional)
 *         status:
 *           type: string
 *           enum: [scheduled, in-progress, completed, cancelled]
 *         attachments:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               fileName:
 *                 type: string
 *               fileUrl:
 *                 type: string
 *               fileType:
 *                 type: string
 *                 enum: [image, document]
 *               fileSize:
 *                 type: number
 *               mimeType:
 *                 type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /meetings:
 *   post:
 *     summary: Create a new meeting
 *     tags: [Meetings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - scheduledDate
 *               - workspaceId
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               scheduledDate:
 *                 type: string
 *                 format: date-time
 *               duration:
 *                 type: number
 *               meetingLink:
 *                 type: string
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *               workspaceId:
 *                 type: string
 *               projectId:
 *                 type: string
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Meeting created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/', uploadMeetings.array('attachments', 5), handleUploadErrors, createMeeting);

/**
 * @swagger
 * /meetings/workspace/{workspaceId}:
 *   get:
 *     summary: Get meetings for a workspace
 *     tags: [Meetings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [scheduled, in-progress, completed, cancelled]
 *     responses:
 *       200:
 *         description: List of meetings
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/workspace/:workspaceId', getMeetingsByWorkspace);

/**
 * @swagger
 * /meetings/{meetingId}:
 *   get:
 *     summary: Get meeting by ID
 *     tags: [Meetings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Meeting details
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Meeting not found
 */
router.get('/:meetingId', getMeetingById);

/**
 * @swagger
 * /meetings/{meetingId}:
 *   put:
 *     summary: Update meeting
 *     tags: [Meetings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
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
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               scheduledDate:
 *                 type: string
 *                 format: date-time
 *               duration:
 *                 type: number
 *               meetingLink:
 *                 type: string
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Meeting updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Meeting not found
 */
router.put('/:meetingId', uploadMeetings.array('attachments', 5), handleUploadErrors, updateMeeting);

/**
 * @swagger
 * /meetings/{meetingId}:
 *   delete:
 *     summary: Delete (cancel) meeting
 *     tags: [Meetings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Meeting cancelled successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Meeting not found
 */
router.delete('/:meetingId', deleteMeeting);

/**
 * @swagger
 * /meetings/{meetingId}/response:
 *   patch:
 *     summary: Update participant response to meeting invitation
 *     tags: [Meetings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [accepted, declined, tentative]
 *     responses:
 *       200:
 *         description: Response updated successfully
 *       400:
 *         description: Invalid response status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not invited to meeting
 *       404:
 *         description: Meeting not found
 */
router.patch('/:meetingId/response', updateParticipantResponse);

export default router;