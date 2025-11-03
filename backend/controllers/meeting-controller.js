import Meeting from '../models/meeting.js';
import User from '../models/user.js';
import Workspace from '../models/workspace.js';
import Project from '../models/project.js';
import Notification from '../models/notification.js';

// Create a new meeting
export const createMeeting = async (req, res) => {
  try {
    const { title, description, scheduledDate, duration, meetingLink, participants, emailParticipants, workspaceId, projectId } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!title || !scheduledDate || !workspaceId) {
      return res.status(400).json({ message: "Title, scheduled date, and workspace are required" });
    }

    // Validate workspace access
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    // Check if user has access to workspace
    const userWorkspace = await User.findById(userId).populate('workspaces.workspaceId');
    const hasAccess = userWorkspace.workspaces.some(ws => ws.workspaceId._id.toString() === workspaceId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to workspace" });
    }

    // Validate project if provided
    if (projectId) {
      const project = await Project.findById(projectId);
      if (!project || project.workspace.toString() !== workspaceId) {
        return res.status(404).json({ message: "Project not found or doesn't belong to workspace" });
      }
    }

    // Validate workspace member participants
    const participantList = [];
    if (participants && participants.length > 0) {
      for (const participantId of participants) {
        const participant = await User.findById(participantId);
        if (!participant) {
          return res.status(404).json({ message: `Participant with ID ${participantId} not found` });
        }
        participantList.push({
          user: participantId,
          status: 'invited'
        });
      }
    }

    // Handle email participants (for external invites)
    const emailParticipantList = [];
    if (emailParticipants && emailParticipants.length > 0) {
      for (const emailParticipant of emailParticipants) {
        // Check if user with this email already exists in the system
        const existingUser = await User.findOne({ email: emailParticipant.email });
        if (existingUser) {
          // If user exists, add them to regular participants
          participantList.push({
            user: existingUser._id,
            status: 'invited'
          });
        } else {
          // Store email for external invitation
          emailParticipantList.push({
            email: emailParticipant.email,
            name: emailParticipant.name || emailParticipant.email
          });
        }
      }
    }

    // Process attachments safely
    let processedAttachments = [];
    if (req.body.attachments && Array.isArray(req.body.attachments)) {
      // If attachments are file objects from multer, process them
      if (req.files && req.files.length > 0) {
        processedAttachments = req.files.map(file => ({
          fileName: file.originalname,
          fileUrl: file.path,
          fileType: file.mimetype.startsWith('image/') ? 'image' : 'document',
          fileSize: file.size,
          mimeType: file.mimetype
        }));
      }
      // If attachments are just file names (current frontend behavior), skip them
      // This prevents validation errors while maintaining backward compatibility
    }

    // Create meeting
    const meeting = new Meeting({
      title,
      description,
      scheduledDate: new Date(scheduledDate),
      duration: duration || 60,
      meetingLink,
      organizer: userId,
      participants: participantList,
      emailParticipants: emailParticipantList,
      workspace: workspaceId,
      project: projectId || null,
      attachments: processedAttachments
    });

    await meeting.save();

    // Populate meeting data for response
    const populatedMeeting = await Meeting.findById(meeting._id)
      .populate('organizer', 'name email')
      .populate('participants.user', 'name email')
      .populate('workspace', 'name')
      .populate('project', 'name');

    // Send notifications to participants
    try {
      for (const participant of participantList) {
        await Notification.create({
          recipient: participant.user,
          sender: userId,
          type: 'meeting_invite',
          title: 'Meeting Invitation',
          message: `You've been invited to "${title}" scheduled for ${new Date(scheduledDate).toLocaleString()}`,
          data: {
            meetingId: meeting._id,
            workspaceId: workspaceId,
            projectId: projectId
          }
        });
      }
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    res.status(201).json({
      success: true,
      message: "Meeting created successfully",
      data: populatedMeeting
    });

  } catch (error) {
    console.error('Create meeting error:', error);
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        message: "Validation error", 
        details: error.message 
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false,
        message: "Invalid ID format", 
        details: error.message 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get meetings for a workspace
export const getMeetingsByWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.id;
    const { startDate, endDate, status } = req.query;

    // Validate workspace access
    const userWorkspace = await User.findById(userId).populate('workspaces.workspaceId');
    const hasAccess = userWorkspace.workspaces.some(ws => ws.workspaceId._id.toString() === workspaceId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to workspace" });
    }

    // Build query
    let query = { 
      workspace: workspaceId,
      isActive: true,
      $or: [
        { organizer: userId },
        { 'participants.user': userId }
      ]
    };

    // Add date filters if provided
    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) query.scheduledDate.$gte = new Date(startDate);
      if (endDate) query.scheduledDate.$lte = new Date(endDate);
    }

    // Add status filter if provided
    if (status) {
      query.status = status;
    }

    const meetings = await Meeting.find(query)
      .populate('organizer', 'name email')
      .populate('participants.user', 'name email')
      .populate('workspace', 'name')
      .populate('project', 'name')
      .sort({ scheduledDate: 1 });

    res.status(200).json({ 
      success: true,
      data: meetings 
    });

  } catch (error) {
    console.error('Get meetings error:', error);
    
    // Handle specific error types
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false,
        message: "Invalid workspace ID format", 
        details: error.message 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get meeting by ID
export const getMeetingById = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user.id;

    const meeting = await Meeting.findById(meetingId)
      .populate('organizer', 'name email')
      .populate('participants.user', 'name email')
      .populate('workspace', 'name')
      .populate('project', 'name');

    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    // Check if user has access to this meeting
    const hasAccess = meeting.organizer._id.toString() === userId || 
                     meeting.participants.some(p => p.user._id.toString() === userId);

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to meeting" });
    }

    res.status(200).json({ meeting });

  } catch (error) {
    console.error('Get meeting error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Update meeting
export const updateMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user.id;
    const updates = req.body;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    // Only organizer can update meeting
    if (meeting.organizer.toString() !== userId) {
      return res.status(403).json({ message: "Only meeting organizer can update the meeting" });
    }

    // Update meeting
    Object.keys(updates).forEach(key => {
      if (key !== '_id' && key !== 'organizer' && key !== 'createdAt' && key !== 'updatedAt') {
        meeting[key] = updates[key];
      }
    });

    await meeting.save();

    const updatedMeeting = await Meeting.findById(meetingId)
      .populate('organizer', 'name email')
      .populate('participants.user', 'name email')
      .populate('workspace', 'name')
      .populate('project', 'name');

    // Send update notifications to participants
    try {
      for (const participant of meeting.participants) {
        await Notification.create({
          recipient: participant.user,
          sender: userId,
          type: 'meeting_updated',
          title: 'Meeting Updated',
          message: `Meeting "${meeting.title}" has been updated`,
          data: {
            meetingId: meeting._id,
            workspaceId: meeting.workspace,
            projectId: meeting.project
          }
        });
      }
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    res.status(200).json({
      message: "Meeting updated successfully",
      meeting: updatedMeeting
    });

  } catch (error) {
    console.error('Update meeting error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Delete meeting
export const deleteMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user.id;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    // Only organizer can delete meeting
    if (meeting.organizer.toString() !== userId) {
      return res.status(403).json({ message: "Only meeting organizer can delete the meeting" });
    }

    // Soft delete
    meeting.isActive = false;
    meeting.status = 'cancelled';
    await meeting.save();

    // Send cancellation notifications to participants
    try {
      for (const participant of meeting.participants) {
        await Notification.create({
          recipient: participant.user,
          sender: userId,
          type: 'meeting_cancelled',
          title: 'Meeting Cancelled',
          message: `Meeting "${meeting.title}" has been cancelled`,
          data: {
            meetingId: meeting._id,
            workspaceId: meeting.workspace,
            projectId: meeting.project
          }
        });
      }
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    res.status(200).json({ message: "Meeting cancelled successfully" });

  } catch (error) {
    console.error('Delete meeting error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Update participant response
export const updateParticipantResponse = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { status } = req.body;
    const userId = req.user.id;

    if (!['accepted', 'declined', 'tentative'].includes(status)) {
      return res.status(400).json({ message: "Invalid response status" });
    }

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    // Find participant
    const participantIndex = meeting.participants.findIndex(p => p.user.toString() === userId);
    if (participantIndex === -1) {
      return res.status(403).json({ message: "You are not invited to this meeting" });
    }

    // Update participant status
    meeting.participants[participantIndex].status = status;
    meeting.participants[participantIndex].responseDate = new Date();
    await meeting.save();

    // Send notification to organizer
    try {
      const user = await User.findById(userId);
      await Notification.create({
        recipient: meeting.organizer,
        sender: userId,
        type: 'meeting_response',
        title: 'Meeting Response',
        message: `${user.name} ${status} the meeting "${meeting.title}"`,
        data: {
          meetingId: meeting._id,
          workspaceId: meeting.workspace,
          projectId: meeting.project
        }
      });
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    res.status(200).json({ message: "Response updated successfully" });

  } catch (error) {
    console.error('Update response error:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};