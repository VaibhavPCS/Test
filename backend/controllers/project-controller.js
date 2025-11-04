import Project from '../models/project.js';
import User from '../models/user.js';
import Workspace from '../models/workspace.js';

// ✅ UPDATED: Create project with projectHead and members
const createProject = async (req, res) => {
  try {
    const { title, description, status, startDate, endDate, projectHeadId } = req.body;
    const userId = req.userId;

    // Get user's current workspace
    const user = await User.findById(userId);
    if (!user.currentWorkspace) {
      return res.status(400).json({ message: "No active workspace found" });
    }

    // ✅ Verify project head exists and is in workspace
    if (!projectHeadId) {
      return res.status(400).json({ message: "Project head is required" });
    }

    const workspace = await Workspace.findById(user.currentWorkspace);
    const projectHeadInWorkspace = workspace.members.some(
      m => m.userId.toString() === projectHeadId
    );

    if (!projectHeadInWorkspace) {
      return res.status(400).json({
        message: "Project head must be a member of the workspace"
      });
    }

    // Handle file attachments
    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        attachments.push({
          filename: file.filename,
          originalName: file.originalname,
          path: file.path,
          size: file.size,
          mimeType: file.mimetype
        });
      });
    }

    // ✅ Create project with new structure
    const project = await Project.create({
      title,
      description,
      status: status || 'Planning',
      startDate,
      endDate,
      workspace: user.currentWorkspace,
      creator: userId,
      projectHead: projectHeadId,
      members: [], // ✅ Start with empty members, project head can add them later
      attachments
    });

    const populatedProject = await Project.findById(project._id)
      .populate('creator', 'name email')
      .populate('workspace', 'name')
      .populate('projectHead', 'name email')
      .populate('members.userId', 'name email');

    res.status(201).json({
      message: "Project created successfully",
      project: populatedProject
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ UPDATED: Get project details with new structure
const getProjectDetails = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.userId;

    const project = await Project.findById(projectId)
      .populate('creator', 'name email')
      .populate('workspace', 'name')
      .populate('projectHead', 'name email')
      .populate('members.userId', 'name email');

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check if user has access to this project
    const user = await User.findById(userId);
    if (user.currentWorkspace?.toString() !== project.workspace._id.toString()) {
      return res.status(403).json({ message: "Access denied to this project" });
    }

    res.status(200).json({ project });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get workspace members for project assignment
const getWorkspaceMembers = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user.currentWorkspace) {
      return res.status(400).json({ message: "No active workspace found" });
    }

    const workspace = await Workspace.findById(user.currentWorkspace)
      .populate('members.userId', 'name email');

    const members = workspace.members.map(member => ({
      _id: member.userId._id,
      name: member.userId.name,
      email: member.userId.email,
      role: member.role
    }));

    res.status(200).json({ members });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Update project
const updateProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const updates = req.body || {};
    const userId = req.userId;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check if user can update this project
    const user = await User.findById(userId);
    const isCreator = project.creator?.toString() === userId;
    const isProjectHead = project.projectHead?.toString() === userId;
    const isAdmin = ['admin', 'super_admin'].includes(user?.role);
    // In the new structure, members don't have roles; restrict updates to creator, project head, or admin
    const canUpdate = isCreator || isProjectHead || isAdmin;

    if (!canUpdate) {
      return res.status(403).json({ message: "You don't have permission to update this project" });
    }

    // If status is being updated, align progress with status mapping
    if (typeof updates.status === 'string') {
      const statusProgress = {
        'Planning': 10,
        'In Progress': 50,
        'On Hold': 30,
        'Completed': 100,
        'Cancelled': 0
      };
      updates.progress = statusProgress[updates.status] ?? project.progress;
    }

    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      updates,
      { new: true }
    )
      .populate('creator', 'name email')
      .populate('workspace', 'name')
      .populate('projectHead', 'name email')
      .populate('members.userId', 'name email');

    res.status(200).json({
      message: "Project updated successfully",
      project: updatedProject
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Delete project
const deleteProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.userId;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Only creator, admin, or super_admin can delete
    const user = await User.findById(userId);
    const canDelete = project.creator.toString() === userId || 
                     ['admin', 'super_admin'].includes(user.role);

    if (!canDelete) {
      return res.status(403).json({ message: "You don't have permission to delete this project" });
    }

    // Soft delete - set isActive to false
    await Project.findByIdAndUpdate(projectId, { isActive: false });

    res.status(200).json({ message: "Project deleted successfully" });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ UPDATED: Add member to project (only project head or admin)
const addMemberToProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { memberEmail } = req.body;
    const userId = req.userId;

    const project = await Project.findById(projectId)
      .populate('projectHead');

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // ✅ Check permission - only project head or admin can add members
    const user = await User.findById(userId);
    const isProjectHead = project.projectHead._id.toString() === userId;
    const isAdmin = ['admin', 'super_admin'].includes(user.role);

    if (!isProjectHead && !isAdmin) {
      return res.status(403).json({ message: "Only project head or admin can add members" });
    }

    // Find the member to add
    const memberToAdd = await User.findOne({
      email: memberEmail,
      'workspaces.workspaceId': project.workspace
    });

    if (!memberToAdd) {
      return res.status(404).json({ message: "Member not found in workspace" });
    }

    // Check if user is already project head
    if (project.projectHead._id.toString() === memberToAdd._id.toString()) {
      return res.status(400).json({ message: "User is already the project head" });
    }

    // Check if member is already in project
    const isAlreadyMember = project.members.some(
      member => member.userId.toString() === memberToAdd._id.toString()
    );

    if (isAlreadyMember) {
      return res.status(400).json({ message: "Member is already in this project" });
    }

    // ✅ Add member to project (no role field needed)
    project.members.push({
      userId: memberToAdd._id
    });

    await project.save();

    const updatedProject = await Project.findById(projectId)
      .populate('creator', 'name email')
      .populate('workspace', 'name')
      .populate('projectHead', 'name email')
      .populate('members.userId', 'name email');

    res.status(200).json({
      message: "Member added to project successfully",
      project: updatedProject
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ UPDATED: Remove member from project
const removeMemberFromProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { memberId } = req.body;
    const userId = req.userId;

    const project = await Project.findById(projectId)
      .populate('projectHead');

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // ✅ Check permission - only project head or admin can remove members
    const user = await User.findById(userId);
    const isProjectHead = project.projectHead._id.toString() === userId;
    const isAdmin = ['admin', 'super_admin'].includes(user.role);

    if (!isProjectHead && !isAdmin) {
      return res.status(403).json({ message: "Only project head or admin can remove members" });
    }

    // Cannot remove project head
    if (project.projectHead._id.toString() === memberId) {
      return res.status(400).json({ message: "Cannot remove project head from project" });
    }

    // ✅ Remove member from project
    project.members = project.members.filter(
      member => member.userId.toString() !== memberId
    );

    await project.save();

    const updatedProject = await Project.findById(projectId)
      .populate('creator', 'name email')
      .populate('workspace', 'name')
      .populate('projectHead', 'name email')
      .populate('members.userId', 'name email');

    res.status(200).json({
      message: "Member removed from project successfully",
      project: updatedProject
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ UPDATED: Get user's role in project with new structure
const getUserProjectRole = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.userId;

    const project = await Project.findById(projectId)
      .populate('projectHead');

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const user = await User.findById(userId);

    let projectRole = 'viewer'; // default

    // ✅ Check if user is project head
    if (project.projectHead._id.toString() === userId) {
      projectRole = 'project-head';
    }
    // Check if user is admin/super_admin
    else if (['admin', 'super_admin'].includes(user.role)) {
      projectRole = 'admin';
    }
    // ✅ Check if user is a member (no role field anymore)
    else {
      const isMember = project.members.some(
        member => member.userId.toString() === userId
      );
      if (isMember) {
        projectRole = 'member';
      }
    }

    res.status(200).json({
      projectRole,
      canEdit: ['project-head', 'admin'].includes(projectRole),
      canDelete: ['project-head', 'admin'].includes(projectRole),
      canViewKanban: ['project-head', 'admin'].includes(projectRole),
      canApprove: ['project-head', 'admin'].includes(projectRole),
      canCreateTask: ['project-head', 'admin'].includes(projectRole) // ✅ NEW: Task creation permission
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ REMOVED: changeMemberRoleInProject - no longer needed since members don't have roles

const getWorkspaceProjects = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user.currentWorkspace) {
      return res.status(200).json({ projects: [] });
    }

    let projects;

    // ✅ UPDATED: Project visibility logic with new structure
    if (['admin', 'super_admin'].includes(user.role)) {
      // Admin & Super Admin: See ALL projects in workspace
      projects = await Project.find({
        workspace: user.currentWorkspace,
        isActive: true
      })
      .populate('creator', 'name email')
      .populate('projectHead', 'name email')
      .populate('members.userId', 'name email')
      .sort({ createdAt: -1 });
    } else {
      // Regular users: Only see projects they are part of
      projects = await Project.find({
        workspace: user.currentWorkspace,
        isActive: true,
        $or: [
          { creator: userId }, // Projects they created
          { projectHead: userId }, // Projects they are head of
          { 'members.userId': userId } // Projects they are member of
        ]
      })
      .populate('creator', 'name email')
      .populate('projectHead', 'name email')
      .populate('members.userId', 'name email')
      .sort({ createdAt: -1 });
    }

    res.status(200).json({ projects });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get project statistics overview for dashboard
const getProjectStatisticsOverview = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user.currentWorkspace) {
      return res.status(200).json({
        totalProjects: 0,
        ongoingProjects: 0,
        completedProjects: 0,
        proposedProjects: 0,
        projectsByStatus: {
          ongoing: 0,
          completed: 0,
          proposed: 0
        }
      });
    }

    let baseQuery = {
      workspace: user.currentWorkspace,
      isActive: true
    };

    // Role-based filtering
    if (!['admin', 'super_admin'].includes(user.role)) {
      // ✅ UPDATED: Regular users see projects they are part of
      baseQuery.$or = [
        { creator: userId }, // Projects they created
        { projectHead: userId }, // Projects they are head of
        { 'members.userId': userId } // Projects they are member of
      ];
    }

    // Get counts for each status (aligned with Project model enum)
    // Model statuses: 'Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled'
    // Dashboard cards: Total, Ongoing, Completed, Proposed
    // Map: Ongoing -> 'In Progress'; Proposed -> 'Planning'
    const [totalProjects, ongoingProjects, completedProjects, proposedProjects] = await Promise.all([
      Project.countDocuments(baseQuery),
      Project.countDocuments({ ...baseQuery, status: 'In Progress' }),
      Project.countDocuments({ ...baseQuery, status: 'Completed' }),
      Project.countDocuments({ ...baseQuery, status: 'Planning' })
    ]);

    const statistics = {
      totalProjects,
      ongoingProjects,
      completedProjects,
      proposedProjects,
      projectsByStatus: {
        // Keep keys for backward compatibility while using canonical status mapping
        ongoing: ongoingProjects,
        completed: completedProjects,
        proposed: proposedProjects
      }
    };

    res.status(200).json(statistics);

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get recent projects with filtering options
const getRecentProjects = async (req, res) => {
  try {
    const userId = req.userId;
    const { status, projectType, limit = 25, sortBy = 'createdAt' } = req.query;

    const user = await User.findById(userId);
    if (!user.currentWorkspace) {
      return res.status(200).json({ 
        projects: [], 
        totalCount: 0, 
        userRole: user.role 
      });
    }

    let baseQuery = {
      workspace: user.currentWorkspace,
      isActive: true
    };

    // Role-based filtering
    if (!['admin', 'super_admin'].includes(user.role)) {
      // ✅ UPDATED: Regular users see projects they are part of
      baseQuery.$or = [
        { creator: userId }, // Projects they created
        { projectHead: userId }, // Projects they are head of
        { 'members.userId': userId } // Projects they are member of
      ];
    }

    // Apply filters
    if (status) {
      baseQuery.status = status;
    }

    if (projectType) {
      baseQuery.projectType = projectType;
    }

    // ✅ UPDATED: Get projects with pagination and sorting
    const projects = await Project.find(baseQuery)
      .populate('creator', 'name email')
      .populate('projectHead', 'name email')
      .populate('members.userId', 'name email')
      .sort({ [sortBy]: -1 })
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalCount = await Project.countDocuments(baseQuery);

    // Format response to match frontend expectations
    const formattedProjects = projects.map(project => ({
      _id: project._id,
      propertyId: project.propertyId || `PP${project._id.toString().slice(-3)}`,
      title: project.title,
      manager: project.creator,
      projectType: project.projectType || 'General',
      department: {
        name: project.department || 'General'
      },
      startDate: project.startDate,
      endDate: project.endDate,
      status: project.status,
      description: project.description,
      categories: project.categories,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    }));

    res.status(200).json({
      projects: formattedProjects,
      totalCount,
      userRole: user.role
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Upload attachments to existing project
const uploadAttachments = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.userId;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check permission - only admin/super_admin or project members can upload
    const user = await User.findById(userId);
    const canUpload = ['admin', 'super_admin'].includes(user.role) ||
                     project.creator.toString() === userId ||
                     project.categories.some(cat =>
                       cat.members.some(member => member.userId.toString() === userId)
                     );

    if (!canUpload) {
      return res.status(403).json({ message: "You don't have permission to upload attachments" });
    }

    // Check attachment limit (max 10)
    if (project.attachments.length >= 10) {
      return res.status(400).json({ message: "Maximum 10 attachments allowed per project" });
    }

    // Calculate remaining slots
    const remainingSlots = 10 - project.attachments.length;

    // Handle file attachments
    const attachments = [];
    if (req.files && req.files.length > 0) {
      // Only take files up to the limit
      const filesToAdd = req.files.slice(0, remainingSlots);

      filesToAdd.forEach(file => {
        attachments.push({
          filename: file.filename,
          originalName: file.originalname,
          path: file.path,
          size: file.size,
          mimeType: file.mimetype
        });
      });
    }

    if (attachments.length === 0) {
      return res.status(400).json({ message: "No files provided" });
    }

    // Add attachments to project
    project.attachments.push(...attachments);
    await project.save();

    const updatedProject = await Project.findById(projectId)
      .populate('creator', 'name email')
      .populate('workspace', 'name')
      .populate('categories.members.userId', 'name email');

    res.status(200).json({
      message: `${attachments.length} attachment(s) uploaded successfully`,
      project: updatedProject
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Delete attachment from project
const deleteAttachment = async (req, res) => {
  try {
    const { projectId, attachmentId } = req.params;
    const userId = req.userId;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check permission - only admin/super_admin can delete attachments
    const user = await User.findById(userId);
    const canDelete = ['admin', 'super_admin'].includes(user.role);

    if (!canDelete) {
      return res.status(403).json({ message: "Only administrators can delete attachments" });
    }

    // Find and remove attachment
    const attachmentIndex = project.attachments.findIndex(
      att => att._id.toString() === attachmentId
    );

    if (attachmentIndex === -1) {
      return res.status(404).json({ message: "Attachment not found" });
    }

    // Remove from array
    project.attachments.splice(attachmentIndex, 1);
    await project.save();

    const updatedProject = await Project.findById(projectId)
      .populate('creator', 'name email')
      .populate('workspace', 'name')
      .populate('categories.members.userId', 'name email');

    res.status(200).json({
      message: "Attachment deleted successfully",
      project: updatedProject
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export {
  createProject,
  getWorkspaceProjects,
  getProjectDetails,
  getWorkspaceMembers,
  updateProject,
  deleteProject,
  addMemberToProject,      // ✅ UPDATED: Renamed from addMemberToCategory, no role parameter
  removeMemberFromProject,  // ✅ UPDATED: Renamed from removeMemberFromCategory
  // ✅ REMOVED: changeMemberRoleInProject - no longer needed (members don't have roles)
  getUserProjectRole,
  getProjectStatisticsOverview,
  getRecentProjects,
  uploadAttachments,
  deleteAttachment
};
