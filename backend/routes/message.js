import express from 'express';
import { 
  sendMessage,
  getMessagesByChat,
  getMessageById,
  editMessage,
  deleteMessage,
  markMessageAsRead,
  addReaction,
  removeReaction,
  searchMessages
} from '../controllers/message-controller.js';
import { authenticateToken } from '../libs/auth-middleware.js';
import { uploadChatFiles, handleUploadErrors } from '../libs/upload-middleware.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Middleware to check if user is chat participant
const requireChatParticipant = async (req, res, next) => {
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

// Middleware to check message ownership or admin rights
const requireMessageAccess = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const Message = (await import('../models/message.js')).default;
    
    const message = await Message.findById(messageId).populate('chat');
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user is admin, message sender, or chat admin
    const isSystemAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const isMessageSender = message.sender.toString() === req.userId.toString();
    const isChatAdmin = message.chat.isChatAdmin(req.userId);
    
    if (!isSystemAdmin && !isMessageSender && !isChatAdmin) {
      return res.status(403).json({ 
        message: 'Access denied. You can only modify your own messages.' 
      });
    }

    req.message = message;
    next();
  } catch (error) {
    return res.status(500).json({ message: 'Error checking message access', error: error.message });
  }
};

/**
 * @swagger
 * components:
 *   schemas:
 *     Message:
 *       type: object
 *       required:
 *         - chat
 *         - sender
 *       properties:
 *         _id:
 *           type: string
 *           description: The auto-generated id of the message
 *         chat:
 *           type: string
 *           description: The chat this message belongs to
 *         sender:
 *           type: string
 *           description: The user who sent the message
 *         content:
 *           type: string
 *           description: The message content
 *         type:
 *           type: string
 *           enum: [text, file, system]
 *           description: The type of message
 *         attachments:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               fileName:
 *                 type: string
 *               originalName:
 *                 type: string
 *               fileUrl:
 *                 type: string
 *               fileType:
 *                 type: string
 *               fileSize:
 *                 type: number
 *               mimeType:
 *                 type: string
 */

/**
 * @swagger
 * /api/messages/chat/{chatId}:
 *   post:
 *     summary: Send a message to a chat
 *     tags: [Messages]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *               replyTo:
 *                 type: string
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Message sent successfully
 *       403:
 *         description: Access denied
 */
router.post('/chat/:chatId', requireChatParticipant, uploadChatFiles.array('attachments', 10), handleUploadErrors, sendMessage);

/**
 * @swagger
 * /api/messages/chat/{chatId}:
 *   get:
 *     summary: Get messages for a chat
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: after
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: List of messages
 *       403:
 *         description: Access denied
 */
router.get('/chat/:chatId', requireChatParticipant, getMessagesByChat);

/**
 * @swagger
 * /api/messages/{messageId}:
 *   get:
 *     summary: Get message by ID
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message details
 *       404:
 *         description: Message not found
 */
router.get('/:messageId', getMessageById);

/**
 * @swagger
 * /api/messages/{messageId}:
 *   put:
 *     summary: Edit a message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
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
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message edited successfully
 *       403:
 *         description: Access denied
 */
router.put('/:messageId', requireMessageAccess, editMessage);

/**
 * @swagger
 * /api/messages/{messageId}:
 *   delete:
 *     summary: Delete a message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message deleted successfully
 *       403:
 *         description: Access denied
 */
router.delete('/:messageId', requireMessageAccess, deleteMessage);

/**
 * @swagger
 * /api/messages/{messageId}/read:
 *   post:
 *     summary: Mark message as read
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message marked as read
 */
router.post('/:messageId/read', markMessageAsRead);

/**
 * @swagger
 * /api/messages/{messageId}/reactions:
 *   post:
 *     summary: Add reaction to message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
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
 *               - emoji
 *             properties:
 *               emoji:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reaction added successfully
 */
router.post('/:messageId/reactions', addReaction);

/**
 * @swagger
 * /api/messages/{messageId}/reactions:
 *   delete:
 *     summary: Remove reaction from message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
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
 *               - emoji
 *             properties:
 *               emoji:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reaction removed successfully
 */
router.delete('/:messageId/reactions', removeReaction);

/**
 * @swagger
 * /api/messages/search/{chatId}:
 *   get:
 *     summary: Search messages in a chat
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/search/:chatId', requireChatParticipant, searchMessages);

export default router;