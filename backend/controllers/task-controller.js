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

    // ✅ Process attachments if provided
    const attachments = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const isImage = file.mimetype.startsWith('image/');
        const subfolder = isImage ? 'images' : 'documents';
        attachments.push({
          fileName: file.originalname,
          fileUrl: `/uploads/task/${subfolder}/${file.filename}`,
          fileType: isImage ? 'image' : 'document',
          fileSize: file.size,
          mimeType: file.mimetype
        });
      }
    }

    const task = new Task({
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
      approvalStatus: 'not-required',
      attachments
    });
    task._auditActor = userId;
    task._auditMetadata = { ipAddress: req.ip, userAgent: req.get('user-agent') };
    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate('assignee', 'name email')
      .populate('creator', 'name email')
      .populate('completedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate({
        path: 'project',
        select: 'title projectHead',
        populate: {
          path: 'projectHead',
          select: '_id name email'
        }
      });

    // ✅ NEW: Update project task count
    await Project.findByIdAndUpdate(projectId, {
      $inc: { totalTasks: 1 }
    });

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
    const previousStatus = task.status;

    if (status === 'done') {
      updates.completedAt = new Date();
      updates.completedBy = userId;
      updates.approvalStatus = 'pending-approval';

      // ✅ NEW: Increment completed tasks count if changing from non-done to done
      if (previousStatus !== 'done') {
        await Project.findByIdAndUpdate(task.project._id, {
          $inc: { completedTasks: 1 }
        });
      }

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
    } else if (status === 'in-progress' || status === 'to-do') {
      // Reset approval status if task is put back to in-progress or to-do
      updates.approvalStatus = 'not-required';
      updates.completedBy = null;
      updates.completedAt = null;

      // ✅ NEW: Decrement completed tasks count if changing from done to non-done
      if (previousStatus === 'done') {
        await Project.findByIdAndUpdate(task.project._id, {
          $inc: { completedTasks: -1 }
        });
      }
    }

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      updates,
      { new: true, auditActor: userId, auditMetadata: { ipAddress: req.ip, userAgent: req.get('user-agent') } }
    )
    .populate('assignee', 'name email')
    .populate('creator', 'name email')
    .populate('completedBy', 'name email')
    .populate({
      path: 'project',
      select: 'title projectHead',
      populate: {
        path: 'projectHead',
        select: '_id name email'
      }
    });

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
      { new: true, auditActor: userId, auditMetadata: { ipAddress: req.ip, userAgent: req.get('user-agent') } }
    )
    .populate('assignee', 'name email')
    .populate('creator', 'name email')
    .populate('completedBy', 'name email')
    .populate('approvedBy', 'name email')
    .populate({
      path: 'project',
      select: 'title projectHead',
      populate: {
        path: 'projectHead',
        select: '_id name email'
      }
    });

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

    // ✅ UPDATED: Regular members see approved tasks only if they're the assignee
    // Project heads and admins see all tasks including approved ones
    if (!isProjectHead && !isAdmin) {
      // Show tasks that are either:
      // 1. Not approved, OR
      // 2. Approved but assigned to the current user (so they can view their completed work)
      query.$or = [
        { approvalStatus: { $ne: 'approved' } },
        { approvalStatus: 'approved', assignee: userId }
      ];
    }

    const tasks = await Task.find(query)
      .populate('assignee', 'name email')
      .populate('creator', 'name email')
      .populate('completedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate({
        path: 'project',
        select: 'title projectHead',
        populate: {
          path: 'projectHead',
          select: '_id name email'
        }
      })
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
    .populate('completedBy', 'name email')
    .populate('approvedBy', 'name email')
    .populate({
      path: 'project',
      select: 'title projectHead',
      populate: {
        path: 'projectHead',
        select: '_id name email'
      }
    })
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

    // Allow assignee, creator, admin/super_admin, or project head to update
    const currentUser = await User.findById(userId);
    const isProjectHead = task.project && task.project.projectHead && task.project.projectHead.toString() === userId;
    const canUpdate = (task.assignee && task.assignee.toString() === userId) || 
                     task.creator.toString() === userId ||
                     ['admin', 'super_admin'].includes(currentUser.role) ||
                     isProjectHead;

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
      { new: true, auditActor: userId, auditMetadata: { ipAddress: req.ip, userAgent: req.get('user-agent') } }
    )
    .populate('assignee', 'name email')
    .populate('creator', 'name email')
    .populate('completedBy', 'name email')
    .populate('approvedBy', 'name email')
    .populate({
      path: 'project',
      select: 'title projectHead',
      populate: {
        path: 'projectHead',
        select: '_id name email'
      }
    });

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
      .populate({
        path: 'project',
        select: 'title projectHead',
        populate: {
          path: 'projectHead',
          select: '_id name email'
        }
      });

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

    await Task.findByIdAndUpdate(
      taskId,
      { isActive: false },
      { auditActor: userId, auditMetadata: { ipAddress: req.ip, userAgent: req.get('user-agent') } }
    );

    // ✅ NEW: Update project task counts
    const updateData = { $inc: { totalTasks: -1 } };
    if (task.status === 'done') {
      updateData.$inc.completedTasks = -1;
    }
    await Project.findByIdAndUpdate(task.project, updateData);

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
      { new: true, auditActor: userId, auditMetadata: { ipAddress: req.ip, userAgent: req.get('user-agent') } }
    )
    .populate('assignee', 'name email')
    .populate('creator', 'name email')
    .populate('completedBy', 'name email')
    .populate('approvedBy', 'name email')
    .populate({
      path: 'project',
      select: 'title projectHead',
      populate: {
        path: 'projectHead',
        select: '_id name email'
      }
    });

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

// ✅ ENHANCED: Reject task with new dates (only project head or admin)
const rejectTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { reason, newStartDate, newDueDate, reassigneeId } = req.body;
    const userId = req.userId;

    console.log('Rejecting task:', { taskId, userId, reason, newStartDate, newDueDate, reassigneeId });

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

    // ✅ NEW: Validate new dates are provided when rejecting
    if (!newStartDate || !newDueDate) {
      return res.status(400).json({ message: "New start date and due date are required when rejecting a task" });
    }

    const start = new Date(newStartDate);
    const end = new Date(newDueDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    if (start > end) {
      return res.status(400).json({ message: "Start date cannot be after due date" });
    }

    // ✅ NEW: Validate task dates don't exceed project end date
    if (project.endDate && end > new Date(project.endDate)) {
      return res.status(400).json({
        message: `Task due date cannot exceed project end date (${new Date(project.endDate).toLocaleDateString()})`
      });
    }

    // ✅ NEW: Compute new duration
    const msPerDay = 1000 * 60 * 60 * 24;
    const durationDays = Math.max(1, Math.ceil((end - start) / msPerDay) + 1);

    // ✅ NEW: Handle reassignment if provided
    const finalAssignee = reassigneeId || task.assignee;
    if (reassigneeId) {
      // Validate reassignee is in project
      const assigneeInProject = project.members.some(m => m.userId._id.toString() === reassigneeId) ||
                                project.projectHead._id.toString() === reassigneeId;

      if (!assigneeInProject && !isAdmin) {
        return res.status(400).json({ message: "Assignee must be a member of this project" });
      }
    }

    // Update task with rejection and new dates
    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      {
        status: 'in-progress', // ✅ Move back to in-progress
        approvalStatus: 'rejected',
        approvedBy: userId,
        approvedAt: new Date(),
        rejectionReason: reason || 'No reason provided',
        completedAt: null,
        completedBy: null,
        startDate: start,
        dueDate: end,
        durationDays,
        assignee: finalAssignee
      },
      { new: true, auditActor: userId, auditMetadata: { ipAddress: req.ip, userAgent: req.get('user-agent') } }
    )
    .populate('assignee', 'name email')
    .populate('creator', 'name email')
    .populate('completedBy', 'name email')
    .populate('approvedBy', 'name email')
    .populate({
      path: 'project',
      select: 'title projectHead',
      populate: {
        path: 'projectHead',
        select: '_id name email'
      }
    });

    // Send notification to task assignee
    if (updatedTask.assignee) {
      try {
        await createNotification({
          recipient: updatedTask.assignee._id,
          sender: userId,
          type: 'task_rejected',
          title: 'Task Rejected',
          message: `Your task "${task.title}" has been rejected. Reason: ${reason || 'No reason provided'}. New deadline: ${end.toLocaleDateString()}`,
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
      message: "Task rejected successfully with new dates",
      task: updatedTask
    });

  } catch (error) {
    console.error('Reject task error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ NEW: Reassign approved task (only project head or admin)
const reassignApprovedTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { assigneeId, startDate, dueDate } = req.body;
    const userId = req.userId;

    console.log('Reassigning approved task:', { taskId, userId, assigneeId, startDate, dueDate });

    const task = await Task.findById(taskId).populate('project');
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check if task is approved
    if (task.approvalStatus !== 'approved') {
      return res.status(400).json({ message: "Only approved tasks can be reassigned" });
    }

    // Get project details
    const project = await Project.findById(task.project._id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check permissions - only project head or admin can reassign
    const currentUser = await User.findById(userId);
    const isProjectHead = project.projectHead.toString() === userId;
    const isAdmin = ['admin', 'super_admin'].includes(currentUser.role);

    if (!isProjectHead && !isAdmin) {
      return res.status(403).json({ message: "Only project head or admin can reassign approved tasks" });
    }

    // Validate new assignee
    if (!assigneeId) {
      return res.status(400).json({ message: "Assignee is required" });
    }

    const assigneeInProject = project.members.some(m => m.userId._id.toString() === assigneeId) ||
                              project.projectHead._id.toString() === assigneeId;

    if (!assigneeInProject && !isAdmin) {
      return res.status(400).json({ message: "Assignee must be a member of this project" });
    }

    // Validate dates
    if (!startDate || !dueDate) {
      return res.status(400).json({ message: "Start date and due date are required" });
    }

    const start = new Date(startDate);
    const end = new Date(dueDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    if (start > end) {
      return res.status(400).json({ message: "Start date cannot be after due date" });
    }

    // ✅ NEW: Validate task dates don't exceed project end date
    if (project.endDate && end > new Date(project.endDate)) {
      return res.status(400).json({
        message: `Task due date cannot exceed project end date (${new Date(project.endDate).toLocaleDateString()})`
      });
    }

    // Compute duration
    const msPerDay = 1000 * 60 * 60 * 24;
    const durationDays = Math.max(1, Math.ceil((end - start) / msPerDay) + 1);

    // Update task - reset to to-do status with new assignee and dates
    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      {
        assignee: assigneeId,
        startDate: start,
        dueDate: end,
        durationDays,
        status: 'to-do',
        approvalStatus: 'not-required',
        completedAt: null,
        completedBy: null,
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null
      },
      { new: true, auditActor: userId, auditMetadata: { ipAddress: req.ip, userAgent: req.get('user-agent') } }
    )
    .populate('assignee', 'name email')
    .populate('creator', 'name email')
    .populate('completedBy', 'name email')
    .populate('approvedBy', 'name email')
    .populate({
      path: 'project',
      select: 'title projectHead',
      populate: {
        path: 'projectHead',
        select: '_id name email'
      }
    });

    // Send notification to new assignee
    if (assigneeId !== userId) {
      try {
        await createNotification({
          recipient: assigneeId,
          sender: userId,
          type: 'task_assigned',
          title: 'Task Reassigned',
          message: `You've been assigned the task: "${task.title}"`,
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
      message: "Task reassigned successfully",
      task: updatedTask
    });

  } catch (error) {
    console.error('Reassign task error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ NEW: Upload task attachments (project head or admin only)
const uploadTaskAttachments = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.userId;

    const task = await Task.findById(taskId).populate({
      path: 'project',
      select: 'projectHead',
      populate: {
        path: 'projectHead',
        select: '_id'
      }
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Get current user details
    const currentUser = await User.findById(userId);

    // Check permissions: only project head or admin can upload
    const isProjectHead = task.project.projectHead._id.toString() === userId;
    const isAdmin = ['admin', 'super_admin'].includes(currentUser.role);

    if (!isProjectHead && !isAdmin) {
      return res.status(403).json({ message: "Only project head or admin can upload task attachments" });
    }

    // Process attachments
    const newAttachments = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const isImage = file.mimetype.startsWith('image/');
        const subfolder = isImage ? 'images' : 'documents';
        newAttachments.push({
          fileName: file.originalname,
          fileUrl: `/uploads/task/${subfolder}/${file.filename}`,
          fileType: isImage ? 'image' : 'document',
          fileSize: file.size,
          mimeType: file.mimetype
        });
      }
    }

    if (newAttachments.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    // Update task with new attachments
    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      {
        $push: { attachments: { $each: newAttachments } }
      },
      { new: true, auditActor: userId, auditMetadata: { ipAddress: req.ip, userAgent: req.get('user-agent') } }
    )
      .populate('assignee', 'name email')
      .populate('creator', 'name email')
      .populate('completedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate({
        path: 'project',
        select: 'title projectHead',
        populate: {
          path: 'projectHead',
          select: '_id name email'
        }
      });

    res.status(200).json({
      message: "Attachments uploaded successfully",
      task: updatedTask
    });

  } catch (error) {
    console.error('Upload task attachments error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ NEW: Delete task attachment (project head or admin only)
const deleteTaskAttachment = async (req, res) => {
  try {
    const { taskId, index } = req.params;
    const userId = req.userId;

    const attachmentIndex = parseInt(index, 10);
    if (isNaN(attachmentIndex) || attachmentIndex < 0) {
      return res.status(400).json({ message: "Invalid attachment index" });
    }

    const task = await Task.findById(taskId).populate({
      path: 'project',
      select: 'projectHead',
      populate: {
        path: 'projectHead',
        select: '_id'
      }
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Get current user details
    const currentUser = await User.findById(userId);

    // Check permissions: only project head or admin can delete
    const isProjectHead = task.project.projectHead._id.toString() === userId;
    const isAdmin = ['admin', 'super_admin'].includes(currentUser.role);

    if (!isProjectHead && !isAdmin) {
      return res.status(403).json({ message: "Only project head or admin can delete task attachments" });
    }

    // Check if attachment exists
    if (!task.attachments || attachmentIndex >= task.attachments.length) {
      return res.status(404).json({ message: "Attachment not found" });
    }

    task.attachments.splice(attachmentIndex, 1);
    task._auditActor = userId;
    task._auditMetadata = { ipAddress: req.ip, userAgent: req.get('user-agent') };
    await task.save();

    const updatedTask = await Task.findById(taskId)
      .populate('assignee', 'name email')
      .populate('creator', 'name email')
      .populate('completedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate({
        path: 'project',
        select: 'title projectHead',
        populate: {
          path: 'projectHead',
          select: '_id name email'
        }
      });

    res.status(200).json({
      message: "Attachment deleted successfully",
      task: updatedTask
    });

  } catch (error) {
    console.error('Delete task attachment error:', error);
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
  rejectTask,   // ✅ ENHANCED: Add reject export
  reassignApprovedTask,  // ✅ NEW: Add reassign export
  uploadTaskAttachments,  // ✅ NEW: Add upload attachments export
  deleteTaskAttachment    // ✅ NEW: Add delete attachment export
};
