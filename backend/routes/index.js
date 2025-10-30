import express from 'express';
import authRoutes from './auth.js';
import workspaceRoutes from './workspace.js';
import projectRoutes from './project.js';
import taskRoutes from './task.js';
import commentRoutes from './comment.js';
import notificationRoutes from './notification.js';
import analyticsRoutes from './analytics.js'; // ✅ Add this

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/workspace', workspaceRoutes);
router.use('/project', projectRoutes);
router.use('/task', taskRoutes);
router.use('/comment', commentRoutes);
router.use('/notification', notificationRoutes);
router.use('/analytics', analyticsRoutes); // ✅ Add this

export default router;
