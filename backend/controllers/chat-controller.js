import Chat from '../models/chat.js';
import User from '../models/user.js';
import Message from '../models/message.js';
import mongoose from 'mongoose';
import { broadcastChatUpdate, broadcastToWorkspace } from '../libs/socket-service.js';

// Create a new chat (admin/super_admin only)
export const createChat = async (req, res) => {
  try {
    const { name, description, workspace, participants = [] } = req.body;
    const creatorId = req.userId;

    // Validate required fields
    if (!name || !workspace) {
      return res.status(400).json({
        message: 'Chat name and workspace are required'
      });
    }

    // Validate workspace access
    const user = await User.findById(creatorId);
    const hasWorkspaceAccess = user.workspaces.some(
      w => w.workspaceId.toString() === workspace.toString()
    );

    if (!hasWorkspaceAccess) {
      return res.status(403).json({
        message: 'Access denied. You are not a member of this workspace.'
      });
    }

    // Validate participants exist and have workspace access
    const participantUsers = await User.find({
      _id: { $in: participants },
      'workspaces.workspaceId': workspace
    });

    if (participants.length > 0 && participantUsers.length !== participants.length) {
      return res.status(400).json({
        message: 'Some participants do not exist or do not have access to this workspace'
      });
    }

    // Create chat participants array
    const chatParticipants = [
      {
        user: creatorId,
        role: 'admin',
        joinedAt: new Date(),
        lastReadAt: new Date(),
        isActive: true
      }
    ];

    // Add other participants as members
    participants.forEach(participantId => {
      if (participantId !== creatorId.toString()) {
        chatParticipants.push({
          user: participantId,
          role: 'member',
          joinedAt: new Date(),
          lastReadAt: new Date(),
          isActive: true
        });
      }
    });

    // Create the chat
    const chat = new Chat({
      name,
      description,
      creator: creatorId,
      workspace,
      participants: chatParticipants,
      lastActivity: new Date()
    });

    await chat.save();

    // Populate the chat for response
    const populatedChat = await Chat.findById(chat._id)
      .populate('creator', 'name email profilePicture')
      .populate('participants.user', 'name email profilePicture')
      .populate('workspace', 'name');

    // Broadcast new chat to participants
    const participantIds = participants.map(p => p.toString());
    broadcastChatUpdate(chat._id, 'created', populatedChat, participantIds);

    res.status(201).json({
      message: 'Chat created successfully',
      data: populatedChat
    });

  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({
      message: 'Error creating chat',
      error: error.message
    });
  }
};

// Get chats by workspace
export const getChatsByWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.userId;
    const { page = 1, limit = 20, search = '', archived = false } = req.query;

    // Validate workspace access
    const user = await User.findById(userId);
    const hasWorkspaceAccess = user.workspaces.some(
      w => w.workspaceId.toString() === workspaceId.toString()
    );

    if (!hasWorkspaceAccess && !['admin', 'super_admin'].includes(user.role)) {
      return res.status(403).json({
        message: 'Access denied. You are not a member of this workspace.'
      });
    }

    // Build query
    const query = {
      workspace: workspaceId,
      isActive: true,
      isArchived: archived === 'true',
      'participants.user': userId,
      'participants.isActive': true
    };

    // Add search if provided
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const chats = await Chat.find(query)
      .populate('creator', 'name email profilePicture')
      .populate('participants.user', 'name email profilePicture')
      .populate('lastMessage')
      .sort({ lastActivity: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalChats = await Chat.countDocuments(query);

    // Add unread message count for each chat
    const chatsWithUnreadCount = await Promise.all(
      chats.map(async (chat) => {
        const participant = chat.participants.find(
          p => p.user._id.toString() === userId.toString()
        );
        
        const unreadCount = await Message.countDocuments({
          chat: chat._id,
          createdAt: { $gt: participant.lastReadAt },
          sender: { $ne: userId },
          isDeleted: false
        });

        return {
          ...chat.toObject(),
          unreadCount
        };
      })
    );

    res.status(200).json({
      chats: chatsWithUnreadCount,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalChats / parseInt(limit)),
        totalChats,
        hasNextPage: skip + chats.length < totalChats,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({
      message: 'Error fetching chats',
      error: error.message
    });
  }
};

// Get chat by ID
export const getChatById = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId;

    const chat = await Chat.findById(chatId)
      .populate('creator', 'name email profilePicture')
      .populate('participants.user', 'name email profilePicture')
      .populate('workspace', 'name')
      .populate('lastMessage');

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Get unread message count
    const participant = chat.participants.find(
      p => p.user._id.toString() === userId.toString()
    );
    
    const unreadCount = participant ? await Message.countDocuments({
      chat: chatId,
      createdAt: { $gt: participant.lastReadAt },
      sender: { $ne: userId },
      isDeleted: false
    }) : 0;

    res.status(200).json({
      chat: {
        ...chat.toObject(),
        unreadCount
      }
    });

  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(500).json({
      message: 'Error fetching chat',
      error: error.message
    });
  }
};

// Update chat
export const updateChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { name, description } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    const chat = await Chat.findByIdAndUpdate(
      chatId,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('creator', 'name email profilePicture')
      .populate('participants.user', 'name email profilePicture')
      .populate('workspace', 'name');

    res.status(200).json({
      message: 'Chat updated successfully',
      chat
    });

  } catch (error) {
    console.error('Error updating chat:', error);
    res.status(500).json({
      message: 'Error updating chat',
      error: error.message
    });
  }
};

// Delete chat
export const deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    // Soft delete - mark as inactive
    await Chat.findByIdAndUpdate(chatId, { isActive: false });

    // Also mark all messages as deleted
    await Message.updateMany(
      { chat: chatId },
      { isDeleted: true, deletedAt: new Date() }
    );

    res.status(200).json({
      message: 'Chat deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting chat:', error);
    res.status(500).json({
      message: 'Error deleting chat',
      error: error.message
    });
  }
};

// Add participant to chat
export const addParticipant = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId, role = 'member' } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Check if user exists and has workspace access
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const hasWorkspaceAccess = user.workspaces.some(
      w => w.workspaceId.toString() === chat.workspace.toString()
    );

    if (!hasWorkspaceAccess) {
      return res.status(400).json({
        message: 'User does not have access to this workspace'
      });
    }

    // Check if user is already a participant
    const existingParticipant = chat.participants.find(
      p => p.user.toString() === userId.toString()
    );

    if (existingParticipant) {
      if (existingParticipant.isActive) {
        return res.status(400).json({ message: 'User is already a participant' });
      } else {
        // Reactivate participant
        existingParticipant.isActive = true;
        existingParticipant.role = role;
        existingParticipant.joinedAt = new Date();
      }
    } else {
      // Add new participant
      chat.participants.push({
        user: userId,
        role,
        joinedAt: new Date(),
        lastReadAt: new Date(),
        isActive: true
      });
    }

    await chat.save();

    const updatedChat = await Chat.findById(chatId)
      .populate('participants.user', 'name email profilePicture');

    // Broadcast participant addition to all chat members
    broadcastChatUpdate(chatId, 'participant-added', {
      chatId,
      newParticipants: addedParticipants,
      chat: updatedChat
    });

    // Notify new participants about the chat
    broadcastChatUpdate(chatId, 'added-to-chat', updatedChat, userIds);

    res.status(200).json({
      message: 'Participants added successfully',
      data: updatedChat
    });

  } catch (error) {
    console.error('Error adding participant:', error);
    res.status(500).json({
      message: 'Error adding participant',
      error: error.message
    });
  }
};

// Remove participant from chat
export const removeParticipant = async (req, res) => {
  try {
    const { chatId, userId } = req.params;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Cannot remove the creator
    if (chat.creator.toString() === userId.toString()) {
      return res.status(400).json({ message: 'Cannot remove chat creator' });
    }

    // Find and deactivate participant
    const participant = chat.participants.find(
      p => p.user.toString() === userId.toString()
    );

    if (!participant) {
      return res.status(404).json({ message: 'Participant not found' });
    }

    participant.isActive = false;
    await chat.save();

    res.status(200).json({
      message: 'Participant removed successfully'
    });

  } catch (error) {
    console.error('Error removing participant:', error);
    res.status(500).json({
      message: 'Error removing participant',
      error: error.message
    });
  }
};

// Update participant role
export const updateParticipantRole = async (req, res) => {
  try {
    const { chatId, userId } = req.params;
    const { role } = req.body;

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Cannot change creator's role
    if (chat.creator.toString() === userId.toString()) {
      return res.status(400).json({ message: 'Cannot change creator role' });
    }

    const participant = chat.participants.find(
      p => p.user.toString() === userId.toString() && p.isActive
    );

    if (!participant) {
      return res.status(404).json({ message: 'Active participant not found' });
    }

    participant.role = role;
    await chat.save();

    res.status(200).json({
      message: 'Participant role updated successfully'
    });

  } catch (error) {
    console.error('Error updating participant role:', error);
    res.status(500).json({
      message: 'Error updating participant role',
      error: error.message
    });
  }
};

// Leave chat
export const leaveChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Creator cannot leave, must transfer ownership or delete chat
    if (chat.creator.toString() === userId.toString()) {
      return res.status(400).json({
        message: 'Chat creator cannot leave. Transfer ownership or delete the chat.'
      });
    }

    const participant = chat.participants.find(
      p => p.user.toString() === userId.toString()
    );

    if (!participant) {
      return res.status(404).json({ message: 'You are not a participant in this chat' });
    }

    participant.isActive = false;
    await chat.save();

    res.status(200).json({
      message: 'Left chat successfully'
    });

  } catch (error) {
    console.error('Error leaving chat:', error);
    res.status(500).json({
      message: 'Error leaving chat',
      error: error.message
    });
  }
};

// Archive chat
export const archiveChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    await Chat.findByIdAndUpdate(chatId, { isArchived: true });

    res.status(200).json({
      message: 'Chat archived successfully'
    });

  } catch (error) {
    console.error('Error archiving chat:', error);
    res.status(500).json({
      message: 'Error archiving chat',
      error: error.message
    });
  }
};

// Unarchive chat
export const unarchiveChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    await Chat.findByIdAndUpdate(chatId, { isArchived: false });

    res.status(200).json({
      message: 'Chat unarchived successfully'
    });

  } catch (error) {
    console.error('Error unarchiving chat:', error);
    res.status(500).json({
      message: 'Error unarchiving chat',
      error: error.message
    });
  }
};

// Update chat settings
export const updateChatSettings = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { allowFileSharing, allowMessageEditing, allowMessageDeletion, maxFileSize } = req.body;

    const updateData = {};
    if (allowFileSharing !== undefined) updateData['settings.allowFileSharing'] = allowFileSharing;
    if (allowMessageEditing !== undefined) updateData['settings.allowMessageEditing'] = allowMessageEditing;
    if (allowMessageDeletion !== undefined) updateData['settings.allowMessageDeletion'] = allowMessageDeletion;
    if (maxFileSize !== undefined) updateData['settings.maxFileSize'] = maxFileSize;

    const chat = await Chat.findByIdAndUpdate(
      chatId,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      message: 'Chat settings updated successfully',
      settings: chat.settings
    });

  } catch (error) {
    console.error('Error updating chat settings:', error);
    res.status(500).json({
      message: 'Error updating chat settings',
      error: error.message
    });
  }
};