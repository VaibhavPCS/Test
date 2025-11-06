import Task from '../models/task.js';
import User from '../models/user.js';
import Project from '../models/project.js';
import { createNotification } from './notification-controller.js';

// ✅ UPDATED: Create task with optional assignee and new project structure
const createTask = async (req, res) => {
  try {
    const { title, description, status, priority, assigneeId, projectId, startDate, dueDate } = req.body;
    const userId = req.userId;

    // ✅ Validate dates
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
      .populate('projectHead', 'name email')
      .populate('members.userId', 'name email');

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Get current user details
    const currentUser = await User.findById(userId);

    // ✅ Check if user is project head or admin (only they can create tasks)
    const isProjectHead = project.projectHead._id.toString() === userId;
    const isAdmin = ['admin', 'super_admin'].includes(currentUser.role);

    if (!isProjectHead && !isAdmin) {
      return res.status(403).json({ message: "Only project head or admin can create tasks" });
    }

    // ✅ NEW: If assignee provided, verify they're in the project
    if (assigneeId) {
      const assigneeInProject = project.members.some(m => m.userId._id.toString() === assigneeId) ||
                                project.projectHead._id.toString() === assigneeId;

      if (!assigneeInProject && !isAdmin) {
        return res.status(400).json({ message: "Assignee must be a member of this project" });
      }
    }

    // ✅ Compute duration in days (inclusive)
    const msPerDay = 1000 * 60 * 60 * 24;
    const durationDays = Math.max(1, Math.ceil((end - start) / msPerDay) + 1);

    // Create task
    const task = await Task.create({
      title,
      description,
      status: status || 'to-do',
      priority: priority || 'medium',
      assignee: assigneeId || null,
      creator: userId,
      project: projectId,
      startDate: start,
      dueDate: end,
      durationDays,
      approvalStatus: 'not-required' // ✅ Default approval status
    });

    const populatedTask = await Task.findById(task._id)
      .populate('assignee', 'name email')
      .populate('creator', 'name email')
      .populate('project', 'title');

    // Send notification only if assignee is different from creator
    if (assigneeId && assigneeId !== userId) {
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

// ✅ UPDATED: Handle approval workflow when marking task as done
const updateTaskStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;
    const userId = req.userId;

    console.log('Updating task status:', { taskId, status, userId });

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    if (!['to-do', 'in-progress', 'done'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const task = await Task.findById(taskId).populate('project');
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check permissions
    const currentUser = await User.findById(userId);
    const canUpdate =
      (task.assignee && task.assignee.toString() === userId) ||
      task.creator.toString() === userId ||
      ['admin', 'super_admin'].includes(currentUser.role);

    if (!canUpdate) {
      return res.status(403).json({ message: "Permission denied to update this task" });
    }

    // ✅ NEW: When marking as done, trigger approval workflow
    const updates = { status };

    if (status === 'done') {
      updates.completedAt = new Date();
      updates.completedBy = userId;
      updates.approvalStatus = 'pending-approval';

      // ✅ Send notification to project head for approval
      const project = await Project.findById(task.project._id);
      if (project && project.projectHead.toString() !== userId) {
        try {
          await createNotification({
            recipient: project.projectHead,
            sender: userId,
            type: 'task_approval_pending',
            title: 'Task Pending Approval',
            message: `Task "${task.title}" has been marked as done and needs your approval`,
            data: {
              taskId: taskId,
              projectId: task.project._id
            }
          });
        } catch (notifError) {
          console.error('Notification error:', notifError);
        }
      }
    } else if (status === 'in-progress') {
      // Reset approval status if task is put back to in-progress
      updates.approvalStatus = 'not-required';
      updates.completedBy = null;
      updates.completedAt = null;
    }

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      updates,
      { new: true }
    )
    .populate('assignee', 'name email')
    .populate('creator', 'name email')
    .populate('completedBy', 'name email')
    .populate('project', 'title');

    // Send notification if status changed by someone else
    if (task.assignee && userId !== task.assignee.toString()) {
      try {
        await createNotification({
          recipient: task.assignee,
          sender: userId,
          type: 'task_updated',
          title: 'Task Status Updated',
          message: `Your task "${task.title}" status changed to ${status.replace('-', ' ')}`,
          data: {
            taskId: taskId,
            projectId: task.project._id
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

// ✅ UPDATED: Filter tasks based on approval status and user role
const getProjectTasks = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.userId;

    // Verify project access
    const project = await Project.findById(projectId)
      .populate('projectHead', 'name email')
      .populate('members.userId', 'name email');

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Get current user details
    const currentUser = await User.findById(userId);

    // ✅ Check if user is project head or admin
    const isProjectHead = project.projectHead._id.toString() === userId;
    const isAdmin = ['admin', 'super_admin'].includes(currentUser.role);

    // ✅ Filter query based on role
    let query = {
      project: projectId,
      isActive: true
    };

    // ✅ Regular members don't see approved tasks
    if (!isProjectHead && !isAdmin) {
      query.approvalStatus = { $ne: 'approved' };
    }

    const tasks = await Task.find(query)
      .populate('assignee', 'name email')
      .populate('creator', 'name email')
      .populate('completedBy', 'name email')
      .populate('approvedBy', 'name email')
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

    const task = await Task.findById(taskId).populate('project');
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Only assignee or creator can update task (or admin/super_admin)
    const currentUser = await User.findById(userId);
    const canUpdate = (task.assignee && task.assignee.toString() === userId) || 
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

    // Map assigneeId -> assignee (with membership validation)
    if (Object.prototype.hasOwnProperty.call(updates, 'assigneeId')) {
      const newAssigneeId = updates.assigneeId || null;

      if (newAssigneeId) {
        try {
          const projectId = task.project && task.project._id ? task.project._id : task.project;
          const project = await Project.findById(projectId)
            .populate('projectHead', 'name email')
            .populate('members.userId', 'name email');

          if (!project) {
            return res.status(404).json({ message: "Project not found" });
          }

          const isAdmin = ['admin', 'super_admin'].includes(currentUser.role);
          const assigneeInProject = project.members.some(m => m.userId._id.toString() === newAssigneeId) ||
                                    project.projectHead._id.toString() === newAssigneeId;

          if (!assigneeInProject && !isAdmin) {
            return res.status(400).json({ message: "Assignee must be a member of this project" });
          }
        } catch (e) {
          console.error('Assignee validation error:', e);
          return res.status(500).json({ message: "Internal Server Error" });
        }
      }

      updates.assignee = newAssigneeId;
      delete updates.assigneeId;
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

// ✅ UPDATED: Get assignable members with new project structure
const getAssignableMembers = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.userId;

    const project = await Project.findById(projectId)
      .populate('projectHead', 'name email')
      .populate('members.userId', 'name email');

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const currentUser = await User.findById(userId);

    // ✅ Check if user has access to this project
    const isProjectHead = project.projectHead._id.toString() === userId;
    const isAdmin = ['admin', 'super_admin'].includes(currentUser.role);
    const isMember = project.members.some(m => m.userId._id.toString() === userId);

    if (!isProjectHead && !isAdmin && !isMember) {
      return res.status(403).json({ message: "You are not a member of this project" });
    }

    // ✅ Return all project members including project head
    const allMembers = [
      {
        _id: project.projectHead._id,
        name: project.projectHead.name,
        email: project.projectHead.email,
        role: 'project-head'
      },
      ...project.members.map(member => ({
        _id: member.userId._id,
        name: member.userId.name,
        email: member.userId.email,
        role: 'member'
      }))
    ];

    res.status(200).json({ members: allMembers });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ UPDATED: Access control with new project structure
const getTaskById = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.userId;

    console.log('Getting task:', { taskId, userId });

    const task = await Task.findById(taskId)
      .populate('assignee', 'name email')
      .populate('creator', 'name email')
      .populate('completedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('project', 'title');

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check access permissions
    const currentUser = await User.findById(userId);

    // Check if user is admin/super_admin
    if (['admin', 'super_admin'].includes(currentUser.role)) {
      return res.status(200).json({ task });
    }

    // Check if user is assignee or creator
    if ((task.assignee && task.assignee._id.toString() === userId) ||
        task.creator._id.toString() === userId) {
      return res.status(200).json({ task });
    }

    // ✅ Check if user is project head or member
    const project = await Project.findById(task.project._id)
      .populate('projectHead')
      .populate('members.userId');

    if (project) {
      const isProjectHead = project.projectHead._id.toString() === userId;
      const isMember = project.members.some(m => m.userId._id.toString() === userId);

      if (isProjectHead || isMember) {
        return res.status(200).json({ task });
      }
    }

    return res.status(403).json({ message: "Access denied" });
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

// ✅ NEW: Approve task (only project head or admin)
const approveTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.userId;

    console.log('Approving task:', { taskId, userId });

    const task = await Task.findById(taskId).populate('project');
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check if task is pending approval
    if (task.approvalStatus !== 'pending-approval') {
      return res.status(400).json({ message: "Task is not pending approval" });
    }

    // Get project details
    const project = await Project.findById(task.project._id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check permissions - only project head or admin can approve
    const currentUser = await User.findById(userId);
    const isProjectHead = project.projectHead.toString() === userId;
    const isAdmin = ['admin', 'super_admin'].includes(currentUser.role);

    if (!isProjectHead && !isAdmin) {
      return res.status(403).json({ message: "Only project head or admin can approve tasks" });
    }

    // Update task with approval
    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      {
        approvalStatus: 'approved',
        approvedBy: userId,
        approvedAt: new Date()
      },
      { new: true }
    )
    .populate('assignee', 'name email')
    .populate('creator', 'name email')
    .populate('completedBy', 'name email')
    .populate('approvedBy', 'name email')
    .populate('project', 'title');

    // Send notification to task assignee
    if (task.assignee) {
      try {
        await createNotification({
          recipient: task.assignee,
          sender: userId,
          type: 'task_approved',
          title: 'Task Approved',
          message: `Your task "${task.title}" has been approved`,
          data: {
            taskId: taskId,
            projectId: task.project._id
          }
        });
      } catch (notifError) {
        console.error('Notification error:', notifError);
      }
    }

    res.status(200).json({
      message: "Task approved successfully",
      task: updatedTask
    });

  } catch (error) {
    console.error('Approve task error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ NEW: Reject task (only project head or admin)
const rejectTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { reason } = req.body;
    const userId = req.userId;

    console.log('Rejecting task:', { taskId, userId, reason });

    const task = await Task.findById(taskId).populate('project');
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check if task is pending approval
    if (task.approvalStatus !== 'pending-approval') {
      return res.status(400).json({ message: "Task is not pending approval" });
    }

    // Get project details
    const project = await Project.findById(task.project._id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check permissions - only project head or admin can reject
    const currentUser = await User.findById(userId);
    const isProjectHead = project.projectHead.toString() === userId;
    const isAdmin = ['admin', 'super_admin'].includes(currentUser.role);

    if (!isProjectHead && !isAdmin) {
      return res.status(403).json({ message: "Only project head or admin can reject tasks" });
    }

    // Update task with rejection
    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      {
        status: 'in-progress', // ✅ Move back to in-progress
        approvalStatus: 'rejected',
        approvedBy: userId,
        approvedAt: new Date(),
        rejectionReason: reason || 'No reason provided',
        completedAt: null,
        completedBy: null
      },
      { new: true }
    )
    .populate('assignee', 'name email')
    .populate('creator', 'name email')
    .populate('approvedBy', 'name email')
    .populate('project', 'title');

    // Send notification to task assignee
    if (task.assignee) {
      try {
        await createNotification({
          recipient: task.assignee,
          sender: userId,
          type: 'task_rejected',
          title: 'Task Rejected',
          message: `Your task "${task.title}" has been rejected. Reason: ${reason || 'No reason provided'}`,
          data: {
            taskId: taskId,
            projectId: task.project._id
          }
        });
      } catch (notifError) {
        console.error('Notification error:', notifError);
      }
    }

    res.status(200).json({
      message: "Task rejected successfully",
      task: updatedTask
    });

  } catch (error) {
    console.error('Reject task error:', error);
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
  deleteTask,
  approveTask,  // ✅ NEW: Add approve export
  rejectTask    // ✅ NEW: Add reject export
};