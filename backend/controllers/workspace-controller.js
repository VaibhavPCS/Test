import Workspace from '../models/workspace.js';
import User from '../models/user.js';
import WorkspaceMemberArchive from '../models/workspace-member-archive.js';
import Task from '../models/task.js';
import { createNotification } from './notification-controller.js';
import Invite from '../models/invite.js';
import crypto from 'crypto';
import { sendInviteEmail } from '../libs/send-email.js';
import Project from '../models/project.js';

const createWorkspace = async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.userId;

    console.log('Create workspace request:', { name, description, userId });

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Workspace name is required" });
    }

    // ✅ ADD PERMISSION CHECK: Only admin and super_admin can create workspaces
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!['admin', 'super_admin'].includes(user.role)) {
      return res.status(403).json({ 
        message: "Permission denied. Only administrators can create workspaces." 
      });
    }

    // ✅ FIXED: Use 'createdBy' to match your model
    const workspace = await Workspace.create({
      name: name.trim(),
      description: description || '',
      createdBy: userId,  // ✅ FIXED: Use 'createdBy' not 'owner'
      members: [{
        userId: userId,
        role: 'owner',
        joinedAt: new Date()
      }]
    });

    // Add workspace to user
    //const user = await User.findById(userId);
    user.workspaces = user.workspaces || [];
    user.workspaces.push({
      workspaceId: workspace._id,
      role: 'owner',
      joinedAt: new Date()
    });

    // Set as current workspace if user has none
    if (!user.currentWorkspace) {
      user.currentWorkspace = workspace._id;
    }

    await user.save();

    res.status(201).json({
      message: "Workspace created successfully",
      workspace: {
        _id: workspace._id,
        name: workspace.name,
        description: workspace.description,
        role: 'owner'
      }
    });

  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get user workspaces
const getUserWorkspaces = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId)
      .populate('workspaces.workspaceId', 'name description createdAt')
      .populate('currentWorkspace', 'name description');

    const workspaces = user.workspaces.filter(w => w.workspaceId);

    res.status(200).json({
      workspaces: workspaces,
      currentWorkspace: user.currentWorkspace
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Switch workspace
const switchWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.body;
    const userId = req.userId;

    console.log('Switch workspace request:', { workspaceId, userId });

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user has access to this workspace
    const hasAccess = user.workspaces?.some(w => w.workspaceId.toString() === workspaceId);
    if (!hasAccess) {
      return res.status(403).json({ message: "You don't have access to this workspace" });
    }

    user.currentWorkspace = workspaceId;
    await user.save();

    res.status(200).json({ message: "Workspace switched successfully" });

  } catch (error) {
    console.error('Switch workspace error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get user tasks from current workspace
const getUserTasks = async (req, res) => {
  try {
    const userId = req.userId;
    const { sortBy = 'createdAt', sortOrder = 'desc', status, priority } = req.query;

    const user = await User.findById(userId);
    if (!user.currentWorkspace) {
      return res.status(200).json({ tasks: [] });
    }

    // Build filter
    let filter = {
      workspace: user.currentWorkspace,
      assignees: userId,
      isActive: true
    };

    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const tasks = await Task.find(filter)
      .populate('creator', 'name email')
      .populate('assignees', 'name email')
      .populate('workspace', 'name')
      .sort(sortOptions)
      .limit(50);

    res.status(200).json({ tasks });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get workspace details
const getWorkspaceDetails = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.userId;

    // Check access
    const user = await User.findById(userId);
    const hasAccess = user.workspaces.some(w => w.workspaceId.toString() === workspaceId);

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this workspace" });
    }

    // ✅ FIXED: Populate 'createdBy' instead of 'owner'
    const workspace = await Workspace.findById(workspaceId)
      .populate('createdBy', 'name email')  // ✅ FIXED
      .populate('members.userId', 'name email');

    res.status(200).json({ workspace });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getWorkspaces = async (req, res) => {
  try {
    const userId = req.userId;

    console.log('Fetching workspaces for user:', userId);

    const user = await User.findById(userId)
      .populate({
        path: 'workspaces.workspaceId',
        model: 'Workspace'
      })
      .populate('currentWorkspace');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.workspaces || user.workspaces.length === 0) {
      console.log('User has no workspaces');
      return res.status(200).json({
        workspaces: [],
        currentWorkspace: null
      });
    }

    // ✅ FIXED: Filter out archived and invalid workspaces
    const validWorkspaces = user.workspaces.filter(uw => 
      uw.workspaceId && uw.workspaceId._id && !uw.workspaceId.isArchived
    );

    let currentWorkspace = user.currentWorkspace;
    if (!currentWorkspace && validWorkspaces.length > 0) {
      currentWorkspace = validWorkspaces[0].workspaceId;
      user.currentWorkspace = currentWorkspace._id;
      await user.save();
    }

    console.log('User workspaces found:', {
      count: validWorkspaces.length,
      currentWorkspace: currentWorkspace?._id
    });

    res.status(200).json({
      workspaces: validWorkspaces,
      currentWorkspace: currentWorkspace
    });

  } catch (error) {
    console.error('Get workspaces error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ FIXED: UPDATE WORKSPACE
const updateWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { name, description } = req.body;
    const userId = req.userId;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Workspace name is required" });
    }

    // Get workspace and check permissions
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    // ✅ FIXED: Check 'isArchived' instead of 'isActive'
    if (workspace.isArchived) {
      return res.status(400).json({ message: "Cannot update archived workspace" });
    }

    // Check if user is owner or admin
    const member = workspace.members.find(m => m.userId.toString() === userId);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ message: "Only owners and admins can update workspace" });
    }

    // Update workspace using findByIdAndUpdate to avoid validation issues
    const updatedWorkspace = await Workspace.findByIdAndUpdate(
      workspaceId,
      {
        name: name.trim(),
        description: description || ''
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      message: "Workspace updated successfully",
      workspace: {
        _id: updatedWorkspace._id,
        name: updatedWorkspace.name,
        description: updatedWorkspace.description
      }
    });

  } catch (error) {
    console.error('Update workspace error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ FIXED: REMOVE MEMBER FROM WORKSPACE
const removeMember = async (req, res) => {
  try {
    const { workspaceId, userId: memberUserId } = req.params;
    const userId = req.userId;

    // Get workspace and check permissions
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    // ✅ FIXED: Check 'isArchived' instead of 'isActive'
    if (workspace.isArchived) {
      return res.status(400).json({ message: "Cannot remove members from archived workspace" });
    }

    // Check if user is owner or admin
    const requester = workspace.members.find(m => m.userId.toString() === userId);
    if (!requester || !['owner', 'admin'].includes(requester.role)) {
      return res.status(403).json({ message: "Only owners and admins can remove members" });
    }

    // Check if member exists
    const memberToRemove = workspace.members.find(m => m.userId.toString() === memberUserId);
    if (!memberToRemove) {
      return res.status(404).json({ message: "Member not found in this workspace" });
    }

    // Cannot remove owner
    if (memberToRemove.role === 'owner') {
      return res.status(400).json({ message: "Cannot remove the owner. Transfer ownership first." });
    }

    // Archive membership for 7 days before removing
    try {
      await WorkspaceMemberArchive.create({
        workspaceId,
        userId: memberUserId,
        role: memberToRemove.role,
        removedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    } catch (archiveErr) {
      console.error('Archive membership failed:', archiveErr);
      // Proceed with removal even if archival fails
    }

    // Remove from workspace members using atomic update
    await Workspace.findByIdAndUpdate(
      workspaceId,
      {
        $pull: { members: { userId: memberUserId } }
      },
      { new: true }
    );

    // Remove from user's workspaces
    await User.updateOne(
      { _id: memberUserId },
      { 
        $pull: { workspaces: { workspaceId: workspaceId } }
      }
    );

    // If this was their current workspace, clear it
    await User.updateOne(
      { _id: memberUserId, currentWorkspace: workspaceId },
      { $unset: { currentWorkspace: "" } }
    );

    // Get member info for response
    const memberUser = await User.findById(memberUserId, 'name email');

    res.status(200).json({
      message: `${memberUser?.name || 'Member'} removed. Data retained for 7 days in case of re-add.`
    });

  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ NEW: CHANGE MEMBER ROLE (Promote/Demote)
const changeMemberRole = async (req, res) => {
  try {
    const { workspaceId, userId: memberUserId } = req.params;
    const { newRole } = req.body;
    const userId = req.userId;

    if (!newRole || !['admin', 'lead', 'member', 'viewer', 'head'].includes(newRole)) {
      return res.status(400).json({ message: "Invalid role. Must be admin, lead, member, viewer, or head" });
    }

    // Get workspace and check permissions
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    // ✅ FIXED: Check 'isArchived' instead of 'isActive'
    if (workspace.isArchived) {
      return res.status(400).json({ message: "Cannot change roles in archived workspace" });
    }

    // Check if requester is owner or admin
    const requester = workspace.members.find(m => m.userId.toString() === userId);
    if (!requester || !['owner', 'admin'].includes(requester.role)) {
      return res.status(403).json({ message: "Only owners and admins can change member roles" });
    }

    // Check if member exists
    const memberToUpdate = workspace.members.find(m => m.userId.toString() === memberUserId);
    if (!memberToUpdate) {
      return res.status(404).json({ message: "Member not found in this workspace" });
    }

    // Cannot change owner role
    if (memberToUpdate.role === 'owner') {
      return res.status(400).json({ message: "Cannot change owner role. Transfer ownership first." });
    }

    // Cannot change your own role (unless you're owner)
    if (memberUserId === userId && requester.role !== 'owner') {
      return res.status(400).json({ message: "You cannot change your own role" });
    }

    // Only owner can promote to admin
    if (newRole === 'admin' && requester.role !== 'owner') {
      return res.status(403).json({ message: "Only owners can promote members to admin" });
    }

    // Update member role in workspace
    await Workspace.findOneAndUpdate(
      { _id: workspaceId, "members.userId": memberUserId },
      { $set: { "members.$.role": newRole } },
      { new: true }
    );

    // Update role in user's workspaces
    await User.findOneAndUpdate(
      { _id: memberUserId, "workspaces.workspaceId": workspaceId },
      { $set: { "workspaces.$.role": newRole } },
      { new: true }
    );

    // Get member info for response
    const memberUser = await User.findById(memberUserId, 'name email');

    res.status(200).json({
      message: `${memberUser?.name || 'Member'} role changed to ${newRole} successfully`,
      member: {
        _id: memberUserId,
        name: memberUser?.name,
        email: memberUser?.email,
        role: newRole
      }
    });

  } catch (error) {
    console.error('Change member role error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ FIXED: TRANSFER WORKSPACE OWNERSHIP
const transferWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { newOwnerId, demoteCurrentOwner } = req.body;
    const userId = req.userId;

    if (!newOwnerId) {
      return res.status(400).json({ message: "New owner ID is required" });
    }

    // Get workspace and check permissions
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    // ✅ FIXED: Check 'isArchived' instead of 'isActive'
    if (workspace.isArchived) {
      return res.status(400).json({ message: "Cannot transfer archived workspace" });
    }

    // Only current owner can transfer
    const currentOwner = workspace.members.find(m => m.role === 'owner');
    if (!currentOwner || currentOwner.userId.toString() !== userId) {
      return res.status(403).json({ message: "Only the current owner can transfer workspace" });
    }

    // Check if new owner exists in workspace
    const newOwnerMember = workspace.members.find(m => m.userId.toString() === newOwnerId);
    if (!newOwnerMember) {
      return res.status(400).json({ message: "New owner must be a member of this workspace" });
    }

    if (newOwnerId === userId) {
      return res.status(400).json({ message: "You are already the owner" });
    }

    // Update roles using atomic operations
    await Workspace.findOneAndUpdate(
      { _id: workspaceId, "members.userId": newOwnerId },
      { $set: { "members.$.role": "owner" } }
    );

    await Workspace.findOneAndUpdate(
      { _id: workspaceId, "members.userId": userId },
      { $set: { "members.$.role": demoteCurrentOwner ? "lead" : "admin" } }
    );

    // ✅ FIXED: Update 'createdBy' field instead of 'owner'
    await Workspace.findByIdAndUpdate(workspaceId, { createdBy: newOwnerId });

    // Update in User model
    await User.findOneAndUpdate(
      { _id: newOwnerId, "workspaces.workspaceId": workspaceId },
      { $set: { "workspaces.$.role": "owner" } }
    );

    await User.findOneAndUpdate(
      { _id: userId, "workspaces.workspaceId": workspaceId },
      { $set: { "workspaces.$.role": demoteCurrentOwner ? "lead" : "admin" } }
    );

    res.status(200).json({
      message: `Workspace ownership transferred successfully. You are now ${demoteCurrentOwner ? 'a lead' : 'an admin'}.`,
      newRole: demoteCurrentOwner ? 'lead' : 'admin'
    });

  } catch (error) {
    console.error('Transfer workspace error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ FIXED: DELETE/ARCHIVE WORKSPACE
const deleteWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.userId;

    // Get workspace and check permissions
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    // ✅ ENHANCED: Better error messages for workspace deletion
    const member = workspace.members.find(m => m.userId.toString() === userId);

    // Check if user is even a member of the workspace
    if (!member) {
      return res.status(403).json({
        message: "You are not a member of this workspace. Only the workspace owner can delete it."
      });
    }

    // Check if user is owner
    if (member.role !== 'owner') {
      return res.status(403).json({
        message: `Only the workspace owner can delete this workspace.Please contact the workspace owner.`
      });
    }

    // ✅ FIXED: Use atomic update instead of save() to avoid validation
    await Workspace.findByIdAndUpdate(
      workspaceId,
      {
        isArchived: true,
        archivedAt: new Date(),
        archivedBy: userId,
        deleteScheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      },
      { new: true }
    );

    // Remove workspace from all users
    await User.updateMany(
      { 'workspaces.workspaceId': workspaceId },
      {
        $pull: { workspaces: { workspaceId: workspaceId } }
      }
    );

    // Clear current workspace if it matches
    await User.updateMany(
      { currentWorkspace: workspaceId },
      { $unset: { currentWorkspace: "" } }
    );

    res.status(200).json({
      message: "Workspace archived successfully. It will be permanently deleted in 7 days."
    });

  } catch (error) {
    console.error('Delete workspace error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


const inviteMember = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { email, role } = req.body;
    const userId = req.userId;

    console.log('Invite request received:', { workspaceId, email, role, userId });

    // Validation
    if (!email || !role) {
      return res.status(400).json({ message: "Email and role are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (!['member', 'admin', 'lead'].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    // Get workspace and check permissions
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    // ✅ Check if workspace is archived
    if (workspace.isArchived) {
      return res.status(400).json({ message: "Cannot invite members to archived workspace" });
    }

    const inviter = await User.findById(userId);
    if (!inviter) {
      return res.status(404).json({ message: "Inviter not found" });
    }

    // Check if user can invite
    const userWorkspace = inviter.workspaces?.find(w => w.workspaceId.toString() === workspaceId);
    if (!userWorkspace || !['owner', 'admin'].includes(userWorkspace.role)) {
      return res.status(403).json({ message: "Only owners and admins can invite members" });
    }

    // Prevent inviting yourself
    if (inviter.email?.toLowerCase() === email.toLowerCase()) {
      return res.status(400).json({ message: "You cannot invite yourself" });
    }

    // Check if user exists
    let inviteUser = await User.findOne({ email });
    
    if (inviteUser) {
      // Prevent inviting workspace owner
      const isOwner = (workspace.createdBy?.toString() === inviteUser._id.toString()) ||
        (workspace.members?.some(m => m.userId.toString() === inviteUser._id.toString() && m.role === 'owner'));
      if (isOwner) {
        return res.status(400).json({ message: "Workspace owner cannot be invited" });
      }
      // Check if already a member
      const isAlreadyMember = inviteUser.workspaces?.some(w => w.workspaceId.toString() === workspaceId);
      if (isAlreadyMember) {
        return res.status(400).json({ message: "User is already a member of this workspace" });
      }

      // If user was previously removed within 7-day window, restore and delete archive
      let restoredFromArchive = false;
      let restoredRole = null;
      try {
        const archive = await WorkspaceMemberArchive.findOne({ workspaceId, userId: inviteUser._id });
        if (archive && archive.expiresAt && archive.expiresAt > new Date()) {
          restoredFromArchive = true;
          restoredRole = archive.role; // restore prior role
          // Clean up archive so TTL doesn't re-trigger
          await WorkspaceMemberArchive.deleteOne({ _id: archive._id });
        }
      } catch (archiveCheckErr) {
        console.error('Archive check failed:', archiveCheckErr);
      }

      // ✅ Add user directly to workspace using atomic update
      // Add to user's workspaces first
      inviteUser.workspaces = inviteUser.workspaces || [];
      inviteUser.workspaces.push({
        workspaceId: workspaceId,
        role: restoredRole || role,
        joinedAt: new Date()
      });
      
      // Set as current workspace if they have none
      if (!inviteUser.currentWorkspace) {
        inviteUser.currentWorkspace = workspaceId;
      }

      await inviteUser.save();

      // ✅ Add to workspace members using atomic update
      await Workspace.findByIdAndUpdate(
        workspaceId,
        {
          $push: {
            members: {
              userId: inviteUser._id,
              role: restoredRole || role,
              joinedAt: new Date()
            }
          }
        },
        { new: true }
      );

      // ✅ Create notification
      try {
        await createNotification({
          recipient: inviteUser._id,
          sender: userId,
          type: 'workspace_invite',
          title: 'Added to Workspace',
          message: `You've been added to ${workspace.name} workspace as ${restoredRole || role} by ${inviter.name}`,
          data: {
            workspaceId: workspaceId,
            role: restoredRole || role,
            inviterName: inviter.name
          }
        });
      } catch (notifError) {
        console.error('Notification creation failed:', notifError);
        // Don't fail the entire request if notification fails
      }

      console.log('User added directly to workspace:', {
        userId: inviteUser._id,
        workspaceId,
        role: restoredRole || role
      });

      return res.status(200).json({
        message: restoredFromArchive
          ? "User restored and added back to workspace successfully"
          : "User added to workspace successfully",
        user: {
          _id: inviteUser._id,
          name: inviteUser.name,
          email: inviteUser.email,
          role: restoredRole || role
        }
      });
    }

    // If user doesn't exist in the system, return a clear error
    return res.status(404).json({ message: "User not found in the system" });

  } catch (error) {
    console.error('Invite member error:', error);
    res.status(500).json({ 
      message: "Internal Server Error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


const acceptInvite = async (req, res) => {
  try {
    const { token } = req.params;
    const userId = req.userId;

    console.log('Accept invite request:', { token, userId });

    // Find the invite
    const invite = await Invite.findOne({ 
      token, 
      status: 'pending',
      expiresAt: { $gt: new Date() }
    }).populate('workspace');

    if (!invite) {
      return res.status(404).json({ message: "Invalid or expired invitation" });
    }

    // Get user
    const user = await User.findById(userId);
    if (!user || user.email !== invite.email) {
      return res.status(403).json({ message: "This invitation is not for you" });
    }

    // Check if already a member
    const isAlreadyMember = user.workspaces?.some(w => w.workspaceId.toString() === invite.workspace._id.toString());
    if (isAlreadyMember) {
      // Mark invite as accepted anyway
      invite.status = 'accepted';
      await invite.save();
      return res.status(200).json({ message: "You are already a member of this workspace" });
    }

    // If user was previously removed within 7-day window, restore and delete archive
    let restoredFromArchive = false;
    let restoredRole = null;
    try {
      const archive = await WorkspaceMemberArchive.findOne({ workspaceId: invite.workspace._id, userId });
      if (archive && archive.expiresAt && archive.expiresAt > new Date()) {
        restoredFromArchive = true;
        restoredRole = archive.role; // restore prior role
        await WorkspaceMemberArchive.deleteOne({ _id: archive._id });
      }
    } catch (archiveCheckErr) {
      console.error('Archive check failed:', archiveCheckErr);
    }

    // Add user to workspace
    user.workspaces = user.workspaces || [];
    user.workspaces.push({
      workspaceId: invite.workspace._id,
      role: restoredRole || invite.role,
      joinedAt: new Date()
    });

    // Set as current workspace if they have none
    if (!user.currentWorkspace) {
      user.currentWorkspace = invite.workspace._id;
    }

    await user.save();

    // Add to workspace members
    const workspace = await Workspace.findById(invite.workspace._id);
    workspace.members = workspace.members || [];
    workspace.members.push({
      userId: user._id,
      role: restoredRole || invite.role,
      joinedAt: new Date()
    });
    await workspace.save();

    // Mark invite as accepted
    invite.status = 'accepted';
    await invite.save();

    res.status(200).json({
      message: restoredFromArchive ? "Successfully restored and joined workspace" : "Successfully joined workspace",
      workspace: {
        _id: workspace._id,
        name: workspace.name,
        role: restoredRole || invite.role
      }
    });

  } catch (error) {
    console.error('Accept invite error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getCurrentWorkspace = async (req, res) => { 
  try {
    const userId = req.userId;

    const user = await User.findById(userId)
      .populate('currentWorkspace', 'name description createdAt');

    if (!user.currentWorkspace) {
      return res.status(200).json({ workspace: null });
    }

    res.status(200).json({
      workspace: user.currentWorkspace
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getAllWorkspaceTasks = async (req, res) => {
  try {
    const userId = req.userId;

    // Get user with current workspace
    const user = await User.findById(userId);
    if (!user?.currentWorkspace) {
      return res.status(200).json({ tasks: [] });
    }

    // Get workspace to check user's role in this workspace
    const workspace = await Workspace.findById(user.currentWorkspace);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Find user's role in this workspace
    const userMembership = workspace.members.find(
      (member) => member.userId.toString() === userId
    );

    if (!userMembership) {
      return res.status(403).json({ message: 'You are not a member of this workspace' });
    }

    const isSuperAdmin = user.role === 'super_admin';
    const isOwner = userMembership.role === 'owner';
    const isWorkspaceAdmin = userMembership.role === 'admin';
    const isGlobalAdmin = user.role === 'admin';

    // Admin visibility rule: must be BOTH global admin and workspace admin
    const canViewAllInWorkspace = isSuperAdmin || isOwner || (isWorkspaceAdmin && isGlobalAdmin);

    let taskFilter = { isActive: true };

    if (canViewAllInWorkspace) {
      // All tasks from all active projects in the current workspace
      const allProjects = await Project.find({
        workspace: user.currentWorkspace,
        isActive: true,
      }).select('_id');

      const projectIds = allProjects.map((p) => p._id);
      taskFilter.project = { $in: projectIds };
      // no assignee restriction
    } else {
      // Project Lead: see all tasks for projects they lead
      const leadProjects = await Project.find({
        workspace: user.currentWorkspace,
        isActive: true,
        projectHead: userId,
      }).select('_id');

      // Member: see only their tasks on projects where they are a member
      const memberProjects = await Project.find({
        workspace: user.currentWorkspace,
        isActive: true,
        'members.userId': userId,
      }).select('_id');

      const leadIds = leadProjects.map((p) => p._id);
      const memberIds = memberProjects.map((p) => p._id);

      const orConditions = [];
      if (leadIds.length > 0) {
        // All tasks in projects led by the user
        orConditions.push({ project: { $in: leadIds } });
      }
      if (memberIds.length > 0) {
        // Only tasks assigned to the user in member projects
        orConditions.push({ project: { $in: memberIds }, assignee: userId });
      }

      if (orConditions.length === 0) {
        // Fallback: only tasks assigned to the user within the workspace
        const allProjects = await Project.find({
          workspace: user.currentWorkspace,
          isActive: true,
        }).select('_id');
        const projectIds = allProjects.map((p) => p._id);
        taskFilter.project = { $in: projectIds };
        taskFilter.assignee = userId;
      } else {
        taskFilter.$or = orConditions;
      }
    }

    const tasks = await Task.find(taskFilter)
      .populate('assignee', 'name email')
      .populate('creator', 'name email')
      .populate('project', 'title')
      .populate({
        path: 'project',
        populate: {
          path: 'workspace',
          select: 'name',
        },
      })
      .sort({ createdAt: -1 });

    const tasksWithSerialNumber = tasks.map((task, index) => ({
      serialNumber: index + 1,
      _id: task._id,
      title: task.title,
      dueDate: task.dueDate,
      assignedTo: task.assignee,
      project: task.project,
      status: task.status,
      priority: task.priority,
      creator: task.creator,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      handoverNotes: task.handoverNotes,
    }));

    res.status(200).json({
      tasks: tasksWithSerialNumber,
      totalTasks: tasksWithSerialNumber.length,
      userRole: userMembership.role,
      workspaceName: workspace.name,
    });
  } catch (error) {
    console.error('Get all workspace tasks error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export {
  createWorkspace,
  getUserWorkspaces,
  switchWorkspace,
  getUserTasks,
  getWorkspaceDetails,
  inviteMember,
  getCurrentWorkspace,
  acceptInvite,
  getWorkspaces,
  updateWorkspace,        // ✅ FIXED
  removeMember,           // ✅ FIXED
  changeMemberRole,       // ✅ NEW
  transferWorkspace,      // ✅ FIXED
  deleteWorkspace,         // ✅ FIXED
  getAllWorkspaceTasks  // ✅ Add this
};
