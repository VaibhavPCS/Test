import Task from '../models/task.js';
import User from '../models/user.js';
import Project from '../models/project.js';
import { createNotification } from './notification-controller.js';

// ✅ UPDATED: Create task with startDate validation
const createTask = async (req, res) => {
  try {
    const { title, description, status, priority, assigneeId, projectId, category, startDate, dueDate } = req.body;
    const userId = req.userId;

    // ✅ NEW: Validate dates
    if (!startDate) {
      return res.status(400).json({ message: "Start date is required" });
    }
    if (!dueDate) {
      return res.status(400).json({ message: "Due date is required" });
    }
    
    const start = new Date(startDate);
    const end = new Date(dueDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }
    
    if (start > end) {
      return res.status(400).json({ message: "Start date cannot be after due date" });
    }

    // Verify project exists and user has access
    const project = await Project.findById(projectId)
      .populate('categories.members.userId', 'email');

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Get current user details
    const currentUser = await User.findById(userId);
    
    // Find user's category in this project
    const userCategory = project.categories.find(cat => 
      cat.members.some(member => member.userId._id.toString() === userId)
    );

    if (!userCategory) {
      return res.status(403).json({ message: "You are not a member of this project" });
    }

    // Check assignment permissions
    const assigneeUser = await User.findById(assigneeId);
    if (!assigneeUser) {
      return res.status(404).json({ message: "Assignee not found" });
    }

    // Permission check: Admin/Super_admin can assign to anyone, others only to their category
    if (!['admin', 'super_admin'].includes(currentUser.role)) {
      // Check if assignee is in the same category as the creator
      const assigneeInCategory = project.categories.find(cat => 
        cat.name === userCategory.name && 
        cat.members.some(member => member.userId._id.toString() === assigneeId)
      );

      if (!assigneeInCategory) {
        return res.status(403).json({ message: "You can only assign tasks to members of your category" });
      }
    }

    // ✅ NEW: Compute duration in days (inclusive)
    const msPerDay = 1000 * 60 * 60 * 24;
    const durationDays = Math.max(1, Math.ceil((end - start) / msPerDay) + 1);

    // Create task
    const task = await Task.create({
      title,
      description,
      status,
      priority,
      assignee: assigneeId,
      creator: userId,
      project: projectId,
      category: userCategory.name,
      startDate: start,
      dueDate: end,
      durationDays
    });

    const populatedTask = await Task.findById(task._id)
      .populate('assignee', 'name email')
      .populate('creator', 'name email')
      .populate('project', 'title');

    if (assigneeId !== userId) {
      await createNotification({
        recipient: assigneeId,
        sender: userId,
        type: 'task_assigned',
        title: 'New Task Assigned',
        message: `You've been assigned a new task: "${title}"`,
        data: {
          taskId: task._id,
          projectId: projectId
        }
      });
    }

    res.status(201).json({
      message: "Task created successfully",
      task: populatedTask
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const updateTaskStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;
    const userId = req.userId;

    console.log('Updating task status:', { taskId, status, userId }); // Debug log

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    if (!['to-do', 'in-progress', 'done'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check permissions
    const currentUser = await User.findById(userId);
    const canUpdate = 
      task.assignee.toString() === userId ||
      task.creator.toString() === userId ||
      ['admin', 'super_admin'].includes(currentUser.role);

    if (!canUpdate) {
      return res.status(403).json({ message: "Permission denied to update this task" });
    }

    // Update task
    const updates = { status };
    if (status === 'done') {
      updates.completedAt = new Date();
    }

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      updates,
      { new: true }
    )
    .populate('assignee', 'name email')
    .populate('creator', 'name email')
    .populate('project', 'title');

    // Send notification if status changed by someone else
    if (userId !== task.assignee.toString()) {
      try {
        await createNotification({
          recipient: task.assignee,
          sender: userId,
          type: 'task_updated',
          title: 'Task Status Updated',
          message: `Your task "${task.title}" status changed to ${status.replace('-', ' ')}`,
          data: {
            taskId: taskId,
            projectId: task.project
          }
        });
      } catch (notifError) {
        console.error('Notification error:', notifError);
      }
    }

    res.status(200).json({
      message: "Task status updated successfully",
      task: updatedTask
    });

  } catch (error) {
    console.error('Update task status error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ NEW: Handover notes function (with attachments)
const updateHandoverNotes = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { handoverNotes } = req.body;
    const userId = req.userId;

    console.log('Updating handover notes:', { taskId, userId, handoverNotes });

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check permissions - assignee, creator, or admin can update
    const currentUser = await User.findById(userId);
    const canUpdate = 
      task.assignee.toString() === userId ||
      task.creator.toString() === userId ||
      ['admin', 'super_admin'].includes(currentUser.role);

    if (!canUpdate) {
      return res.status(403).json({ message: "Permission denied to update handover notes" });
    }

    // Prepare attachments if provided
    const newAttachments = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const isImage = file.mimetype.startsWith('image/');
        const subfolder = isImage ? 'images' : 'documents';
        newAttachments.push({
          fileName: file.originalname,
          fileUrl: `/uploads/handover/${subfolder}/${file.filename}`,
          fileType: isImage ? 'image' : 'document',
          fileSize: file.size,
          mimeType: file.mimetype
        });
      }
    }

    // Update notes and append attachments atomically
    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      {
        $set: { handoverNotes: handoverNotes || '' },
        ...(newAttachments.length > 0 ? { $push: { handoverAttachments: { $each: newAttachments } } } : {})
      },
      { new: true }
    )
    .populate('assignee', 'name email')
    .populate('creator', 'name email')
    .populate('project', 'title');

    console.log('Handover notes updated successfully');

    res.status(200).json({
      message: "Handover notes updated successfully",
      task: updatedTask
    });

  } catch (error) {
    console.error('Update handover notes error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getProjectTasks = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.userId;

    // Verify project access
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const tasks = await Task.find({ 
      project: projectId,
      isActive: true 
    })
    .populate('assignee', 'name email')
    .populate('creator', 'name email')
    .sort({ createdAt: -1 });

    res.status(200).json({ tasks });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get user's tasks in project
const getUserProjectTasks = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.userId;

    const tasks = await Task.find({ 
      project: projectId,
      assignee: userId,
      isActive: true 
    })
    .populate('assignee', 'name email')
    .populate('creator', 'name email')
    .sort({ createdAt: -1 });

    res.status(200).json({ tasks });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ UPDATED: Update task with date validation
const updateTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const updates = req.body;
    const userId = req.userId;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Only assignee or creator can update task (or admin/super_admin)
    const currentUser = await User.findById(userId);
    const canUpdate = task.assignee.toString() === userId || 
                     task.creator.toString() === userId ||
                     ['admin', 'super_admin'].includes(currentUser.role);

    if (!canUpdate) {
      return res.status(403).json({ message: "You can only update your own tasks" });
    }

    // ✅ NEW: If dates are changing, validate consistency
    let nextStart = task.startDate;
    let nextDue = task.dueDate;

    if (updates.startDate) {
      const s = new Date(updates.startDate);
      if (isNaN(s.getTime())) {
        return res.status(400).json({ message: "Invalid start date" });
      }
      nextStart = s;
    }
    if (updates.dueDate) {
      const d = new Date(updates.dueDate);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ message: "Invalid due date" });
      }
      nextDue = d;
    }

    // Enforce start <= due
    if (nextStart && nextDue && nextStart > nextDue) {
      return res.status(400).json({ message: "Start date cannot be after due date" });
    }

    // Recompute durationDays if either date changed
    if (updates.startDate || updates.dueDate) {
      const msPerDay = 1000 * 60 * 60 * 24;
      updates.durationDays = Math.max(1, Math.ceil((nextDue - nextStart) / msPerDay) + 1);
    }

    const updatedTask = await Task.findByIdAndUpdate(
      taskId, 
      updates, 
      { new: true }
    )
    .populate('assignee', 'name email')
    .populate('creator', 'name email');

    res.status(200).json({
      message: "Task updated successfully",
      task: updatedTask
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get assignable members for task creation
const getAssignableMembers = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.userId;

    const project = await Project.findById(projectId)
      .populate('categories.members.userId', 'name email');

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const currentUser = await User.findById(userId);
    
    // If admin/super_admin, return all project members
    if (['admin', 'super_admin'].includes(currentUser.role)) {
      const allMembers = project.categories.reduce((acc, category) => {
        category.members.forEach(member => {
          if (!acc.find(m => m._id.toString() === member.userId._id.toString())) {
            acc.push({
              _id: member.userId._id,
              name: member.userId.name,
              email: member.userId.email,
              category: category.name,
              role: member.role
            });
          }
        });
        return acc;
      }, []);

      return res.status(200).json({ members: allMembers });
    }

    // Find user's category and return only those members
    const userCategory = project.categories.find(cat => 
      cat.members.some(member => member.userId._id.toString() === userId)
    );

    if (!userCategory) {
      return res.status(403).json({ message: "You are not a member of this project" });
    }

    const categoryMembers = userCategory.members.map(member => ({
      _id: member.userId._id,
      name: member.userId.name,
      email: member.userId.email,
      category: userCategory.name,
      role: member.role
    }));

    res.status(200).json({ members: categoryMembers });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getTaskById = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.userId;

    console.log('Getting task:', { taskId, userId });

    const task = await Task.findById(taskId)
      .populate('assignee', 'name email')
      .populate('creator', 'name email')
      .populate('project', 'title');

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check access permissions
    const currentUser = await User.findById(userId);
    const hasAccess = (
      task.assignee._id.toString() === userId ||
      task.creator._id.toString() === userId ||
      ['admin', 'super_admin'].includes(currentUser.role)
    );

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.status(200).json({ task });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ NEW: Delete task function
const deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.userId;

    console.log('Deleting task:', { taskId, userId });

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check permissions - only assignee, creator, or admin can delete
    const currentUser = await User.findById(userId);
    const canDelete = 
      task.assignee.toString() === userId ||
      task.creator.toString() === userId ||
      ['admin', 'super_admin'].includes(currentUser.role);

    if (!canDelete) {
      return res.status(403).json({ message: "Permission denied to delete this task" });
    }

    // Soft delete - mark as inactive instead of hard delete
    await Task.findByIdAndUpdate(taskId, { isActive: false });

    // Send notification to assignee if deleted by someone else
    if (userId !== task.assignee.toString()) {
      try {
        await createNotification({
          recipient: task.assignee,
          sender: userId,
          type: 'task_deleted',
          title: 'Task Deleted',
          message: `Task "${task.title}" has been deleted`,
          data: {
            taskId: taskId,
            projectId: task.project
          }
        });
      } catch (notifError) {
        console.error('Notification error:', notifError);
      }
    }

    console.log('Task deleted successfully');

    res.status(200).json({
      message: "Task deleted successfully"
    });

  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export {
  createTask,
  getProjectTasks,
  getUserProjectTasks,
  updateTask,
  updateTaskStatus,
  updateHandoverNotes,
  getTaskById,         
  getAssignableMembers,
  deleteTask  // ✅ NEW: Add delete export
};