import express from 'express';
import authRoutes from './auth.js';
import workspaceRoutes from './workspace.js';
import projectRoutes from './project.js';
import taskRoutes from './task.js';
import commentRoutes from './comment.js';
import notificationRoutes from './notification.js';
import analyticsRoutes from './analytics.js';
import meetingRoutes from './meeting.js';
import chatRoutes from './chat.js';
import messageRoutes from './message.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/workspace', workspaceRoutes);
router.use('/project', projectRoutes);
router.use('/task', taskRoutes);
router.use('/comments', commentRoutes);
router.use('/notification', notificationRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/meetings', meetingRoutes);
router.use('/chats', chatRoutes);
router.use('/messages', messageRoutes);

export default router;
