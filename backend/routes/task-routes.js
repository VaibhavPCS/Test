// // Make sure you have proper task route setup
// import express from 'express';
// import { 
//   createTask,
//   getAllTasks,
//   getTaskById, // ✅ Make sure this exists
//   updateTaskById,
//   deleteTaskById,
//   getTasksByProject,
//   getTasksByUser
// } from '../controllers/task-controller.js';
// import { authenticate } from '../middlewares/auth-middleware.js';

// const router = express.Router();

// // ✅ CRITICAL: Make sure this route exists and comes BEFORE parameterized routes
// router.get('/:id', authenticate, getTaskById);
// router.get('/project/:projectId', authenticate, getTasksByProject);
// router.get('/project/:projectId/user', authenticate, getTasksByUser);

// router.post('/', authenticate, createTask);
// router.put('/:id', authenticate, updateTaskById);
// router.delete('/:id', authenticate, deleteTaskById);
// router.get('/', authenticate, getAllTasks);

// export default router;
