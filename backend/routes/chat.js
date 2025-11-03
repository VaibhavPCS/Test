import express from 'express';
import { 
  createChat,
  getChatsByWorkspace,
  getChatById,
  updateChat,
  deleteChat,
  addParticipant,
  removeParticipant,
  updateParticipantRole,
  leaveChat,
  archiveChat,
  unarchiveChat,
  updateChatSettings
} from '../controllers/chat-controller.js';
import { authenticateToken } from '../libs/auth-middleware.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Middleware to check admin/super_admin role for chat creation
const requireAdminRole = (req, res, next) => {
  if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ 
      message: 'Access denied. Only admin and super_admin users can create chats.' 
    });
  }
  next();
};

// Middleware to check if user is chat participant or admin
const requireChatAccess = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const Chat = (await import('../models/chat.js')).default;
    
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Check if user is admin/super_admin or chat participant
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const isParticipant = chat.isParticipant(req.userId);
    
    if (!isAdmin && !isParticipant) {
      return res.status(403).json({ 
        message: 'Access denied. You are not a participant in this chat.' 
      });
    }

    req.chat = chat;
    next();
  } catch (error) {
    return res.status(500).json({ message: 'Error checking chat access', error: error.message });
  }
};

// Middleware to check if user can manage chat (creator or admin)
const requireChatManagement = (req, res, next) => {
  const isSystemAdmin = ['admin', 'super_admin'].includes(req.user.role);
  const isChatAdmin = req.chat.isChatAdmin(req.userId);
  
  if (!isSystemAdmin && !isChatAdmin) {
    return res.status(403).json({ 
      message: 'Access denied. Only chat admins can perform this action.' 
    });
  }
  next();
};

/**
 * @swagger
 * components:
 *   schemas:
 *     Chat:
 *       type: object
 *       required:
 *         - name
 *         - creator
 *         - workspace
 *       properties:
 *         _id:
 *           type: string
 *           description: The auto-generated id of the chat
 *         name:
 *           type: string
 *           description: The chat name
 *         description:
 *           type: string
 *           description: The chat description
 *         type:
 *           type: string
 *           enum: [group, direct]
 *           description: The type of chat
 *         creator:
 *           type: string
 *           description: The user who created the chat
 *         workspace:
 *           type: string
 *           description: The workspace this chat belongs to
 *         participants:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               user:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, member]
 *               joinedAt:
 *                 type: string
 *                 format: date-time
 *               lastReadAt:
 *                 type: string
 *                 format: date-time
 *               isActive:
 *                 type: boolean
 */

/**
 * @swagger
 * /api/chats:
 *   post:
 *     summary: Create a new chat (admin/super_admin only)
 *     tags: [Chats]
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
 *               - workspace
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               workspace:
 *                 type: string
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Chat created successfully
 *       403:
 *         description: Access denied - admin role required
 */
router.post('/', requireAdminRole, createChat);

/**
 * @swagger
 * /api/chats/workspace/{workspaceId}:
 *   get:
 *     summary: Get all chats for a workspace
 *     tags: [Chats]
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
 *         description: List of chats
 */
router.get('/workspace/:workspaceId', getChatsByWorkspace);

/**
 * @swagger
 * /api/chats/{chatId}:
 *   get:
 *     summary: Get chat by ID
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chat details
 *       404:
 *         description: Chat not found
 *       403:
 *         description: Access denied
 */
router.get('/:chatId', requireChatAccess, getChatById);

/**
 * @swagger
 * /api/chats/{chatId}:
 *   put:
 *     summary: Update chat details (admin only)
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
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
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Chat updated successfully
 *       403:
 *         description: Access denied
 */
router.put('/:chatId', requireChatAccess, requireChatManagement, updateChat);

/**
 * @swagger
 * /api/chats/{chatId}:
 *   delete:
 *     summary: Delete chat (admin only)
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chat deleted successfully
 *       403:
 *         description: Access denied
 */
router.delete('/:chatId', requireChatAccess, requireChatManagement, deleteChat);

/**
 * @swagger
 * /api/chats/{chatId}/participants:
 *   post:
 *     summary: Add participant to chat (admin only)
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
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
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, member]
 *                 default: member
 *     responses:
 *       200:
 *         description: Participant added successfully
 */
router.post('/:chatId/participants', requireChatAccess, requireChatManagement, addParticipant);

/**
 * @swagger
 * /api/chats/{chatId}/participants/{userId}:
 *   delete:
 *     summary: Remove participant from chat (admin only)
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Participant removed successfully
 */
router.delete('/:chatId/participants/:userId', requireChatAccess, requireChatManagement, removeParticipant);

/**
 * @swagger
 * /api/chats/{chatId}/participants/{userId}/role:
 *   patch:
 *     summary: Update participant role (admin only)
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
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
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [admin, member]
 *     responses:
 *       200:
 *         description: Participant role updated successfully
 */
router.patch('/:chatId/participants/:userId/role', requireChatAccess, requireChatManagement, updateParticipantRole);

/**
 * @swagger
 * /api/chats/{chatId}/leave:
 *   post:
 *     summary: Leave chat
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Left chat successfully
 */
router.post('/:chatId/leave', requireChatAccess, leaveChat);

/**
 * @swagger
 * /api/chats/{chatId}/archive:
 *   post:
 *     summary: Archive chat (admin only)
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chat archived successfully
 */
router.post('/:chatId/archive', requireChatAccess, requireChatManagement, archiveChat);

/**
 * @swagger
 * /api/chats/{chatId}/unarchive:
 *   post:
 *     summary: Unarchive chat (admin only)
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chat unarchived successfully
 */
router.post('/:chatId/unarchive', requireChatAccess, requireChatManagement, unarchiveChat);

/**
 * @swagger
 * /api/chats/{chatId}/settings:
 *   patch:
 *     summary: Update chat settings (admin only)
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
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
 *               allowFileSharing:
 *                 type: boolean
 *               allowMessageEditing:
 *                 type: boolean
 *               allowMessageDeletion:
 *                 type: boolean
 *               maxFileSize:
 *                 type: number
 *     responses:
 *       200:
 *         description: Chat settings updated successfully
 */
router.patch('/:chatId/settings', requireChatAccess, requireChatManagement, updateChatSettings);

export default router;