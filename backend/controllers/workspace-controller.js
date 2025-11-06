import Workspace from '../models/workspace.js';
import User from '../models/user.js';
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
      message: `${memberUser?.name || 'Member'} removed from workspace successfully`
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

    // Check if user is owner
    const member = workspace.members.find(m => m.userId.toString() === userId);
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ message: "Only the owner can delete workspace" });
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

    if (!['member', 'admin', 'lead', 'viewer', 'head'].includes(role)) {
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

    // Check if user exists
    let inviteUser = await User.findOne({ email });
    
    if (inviteUser) {
      // Check if already a member
      const isAlreadyMember = inviteUser.workspaces?.some(w => w.workspaceId.toString() === workspaceId);
      if (isAlreadyMember) {
        return res.status(400).json({ message: "User is already a member of this workspace" });
      }

      // ✅ FIXED: Add user directly to workspace using atomic update
      // Add to user's workspaces first
      inviteUser.workspaces = inviteUser.workspaces || [];
      inviteUser.workspaces.push({
        workspaceId: workspaceId,
        role: role,
        joinedAt: new Date()
      });
      
      // Set as current workspace if they have none
      if (!inviteUser.currentWorkspace) {
        inviteUser.currentWorkspace = workspaceId;
      }

      await inviteUser.save();

      // ✅ FIXED: Add to workspace members using atomic update instead of save()
      await Workspace.findByIdAndUpdate(
        workspaceId,
        {
          $push: {
            members: {
              userId: inviteUser._id,
              role: role,
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
          message: `You've been added to ${workspace.name} workspace as ${role} by ${inviter.name}`,
          data: {
            workspaceId: workspaceId,
            role: role,
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
        role
      });

      return res.status(200).json({
        message: "User added to workspace successfully",
        user: {
          _id: inviteUser._id,
          name: inviteUser.name,
          email: inviteUser.email,
          role: role
        }
      });
    }

    // ✅ IF USER DOESN'T EXIST, CREATE INVITE TOKEN
    const inviteToken = crypto.randomBytes(32).toString('hex');
    
    // Check for existing pending invite
    const existingInvite = await Invite.findOne({ 
      email, 
      workspace: workspaceId, 
      status: 'pending' 
    });
    
    if (existingInvite) {
      return res.status(400).json({ message: "Invite already sent to this email" });
    }

    // ✅ Create invite for non-existing users
    const invite = await Invite.create({
      email,
      workspace: workspaceId,
      invitedBy: userId,
      role,
      token: inviteToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    // ✅ TODO: Send email here (uncomment when email service is ready)
    // try {
    //   await sendInviteEmail({
    //     email: email,
    //     inviterName: inviter.name,
    //     workspaceName: workspace.name,
    //     role: role,
    //     inviteToken: inviteToken
    //   });
    // } catch (emailError) {
    //   console.error('Email sending failed:', emailError);
    //   // Don't fail the request if email fails
    // }

    console.log('Invite created for non-existing user:', {
      email,
      workspaceId,
      role,
      token: inviteToken
    });

    res.status(200).json({ 
      message: "Invitation sent successfully. User will receive an email to join the platform and workspace.",
      invite: {
        _id: invite._id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt
      }
    });

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

    // Add user to workspace
    user.workspaces = user.workspaces || [];
    user.workspaces.push({
      workspaceId: invite.workspace._id,
      role: invite.role,
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
      role: invite.role,
      joinedAt: new Date()
    });
    await workspace.save();

    // Mark invite as accepted
    invite.status = 'accepted';
    await invite.save();

    res.status(200).json({
      message: "Successfully joined workspace",
      workspace: {
        _id: workspace._id,
        name: workspace.name,
        role: invite.role
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
    if (!user.currentWorkspace) {
      return res.status(200).json({ tasks: [] });
    }

    // Get workspace to check user's role in this workspace
    const workspace = await Workspace.findById(user.currentWorkspace);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    // Find user's role in this workspace
    const userMembership = workspace.members.find(
      member => member.userId.toString() === userId
    );

    if (!userMembership) {
      return res.status(403).json({ message: "You are not a member of this workspace" });
    }

    let taskFilter = {
      isActive: true
    };

    // Role-based task filtering logic
    if (user.role === 'super_admin') {
      // ✅ Super Admin: ALL tasks in ANY workspace
      taskFilter = {
        ...taskFilter
        // No workspace filter - can see across workspaces if needed
        // For now, limit to current workspace
      };
    } else if (userMembership.role === 'owner' || userMembership.role === 'admin') {
      // ✅ Workspace Owner/Admin: ALL tasks in THIS workspace only
      taskFilter = {
        ...taskFilter
        // Will add workspace filter through Project lookup
      };
    } else {
      // ✅ Regular Members: Only their assigned tasks
      taskFilter = {
        ...taskFilter,
        assignee: userId
      };
    }

    // Find all projects in current workspace that user has access to
    let accessibleProjects;
    
    if (user.role === 'super_admin' || ['owner', 'admin'].includes(userMembership.role)) {
      // Get ALL projects in workspace
      accessibleProjects = await Project.find({
        workspace: user.currentWorkspace,
        isActive: true
      }).select('_id');
    } else {
      // Get only projects where user is a member
      accessibleProjects = await Project.find({
        workspace: user.currentWorkspace,
        isActive: true,
        'categories.members.userId': userId
      }).select('_id');
    }

    const projectIds = accessibleProjects.map(p => p._id);

    // Add project filter to task filter
    taskFilter.project = { $in: projectIds };

    // Get tasks based on role and filters
    const tasks = await Task.find(taskFilter)
      .populate('assignee', 'name email')
      .populate('creator', 'name email')
      .populate('project', 'title')
      .populate({
        path: 'project',
        populate: {
          path: 'workspace',
          select: 'name'
        }
      })
      .sort({ createdAt: -1 });

    // Add serial numbers for gallery view
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
      handoverNotes: task.handoverNotes
    }));

    res.status(200).json({ 
      tasks: tasksWithSerialNumber,
      totalTasks: tasksWithSerialNumber.length,
      userRole: userMembership.role,
      workspaceName: workspace.name
    });

  } catch (error) {
    console.error('Get all workspace tasks error:', error);
    res.status(500).json({ message: "Internal Server Error" });
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
