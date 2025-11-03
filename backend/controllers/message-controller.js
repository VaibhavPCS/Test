import Message from '../models/message.js';
import Chat from '../models/chat.js';
import User from '../models/user.js';
import path from 'path';
import fs from 'fs';
import { broadcastMessage, broadcastMessageUpdate } from '../libs/socket-service.js';

// Send a message
export const sendMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { content, replyTo } = req.body;
    const senderId = req.userId;
    const files = req.files;

    // Validate that message has content or attachments
    if (!content && (!files || files.length === 0)) {
      return res.status(400).json({
        message: 'Message must have either content or attachments'
      });
    }

    // Get chat and validate settings
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Check file sharing permission
    if (files && files.length > 0 && !chat.settings.allowFileSharing) {
      return res.status(403).json({
        message: 'File sharing is disabled for this chat'
      });
    }

    // Validate reply-to message if provided
    if (replyTo) {
      const replyMessage = await Message.findById(replyTo);
      if (!replyMessage || replyMessage.chat.toString() !== chatId) {
        return res.status(400).json({
          message: 'Invalid reply-to message'
        });
      }
    }

    // Process file attachments
    const attachments = [];
    if (files && files.length > 0) {
      for (const file of files) {
        // Check file size against chat settings
        if (file.size > chat.settings.maxFileSize) {
          return res.status(400).json({
            message: `File ${file.originalname} exceeds maximum size limit`
          });
        }

        // Determine file type
        let fileType = 'other';
        if (file.mimetype.startsWith('image/')) {
          fileType = 'image';
        } else if (file.mimetype.startsWith('video/')) {
          fileType = 'video';
        } else if (file.mimetype.startsWith('audio/')) {
          fileType = 'audio';
        } else if (file.mimetype === 'application/pdf' || 
                   file.mimetype.includes('document') || 
                   file.mimetype.includes('spreadsheet') ||
                   file.mimetype === 'text/plain') {
          fileType = 'document';
        }

        attachments.push({
          fileName: file.filename,
          originalName: file.originalname,
          fileUrl: `/uploads/chats/${fileType === 'image' ? 'images' : 'documents'}/${file.filename}`,
          fileType,
          fileSize: file.size,
          mimeType: file.mimetype,
          uploadedAt: new Date()
        });
      }
    }

    // Create message
    const message = new Message({
      chat: chatId,
      sender: senderId,
      content: content || '',
      type: attachments.length > 0 ? 'file' : 'text',
      attachments,
      replyTo: replyTo || undefined,
      metadata: {
        platform: 'web',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    await message.save();

    // Update chat's last message and activity
    await Chat.findByIdAndUpdate(chatId, {
      lastMessage: message._id,
      lastActivity: new Date(),
      $inc: { messageCount: 1 }
    });

    // Populate message for response
    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'name email profilePicture')
      .populate('replyTo', 'content sender')
      .populate({
        path: 'replyTo',
        populate: {
          path: 'sender',
          select: 'name email profilePicture'
        }
      });

    // Broadcast message to chat participants in real-time
    broadcastMessage(chatId, populatedMessage, senderId);

    res.status(201).json({
      message: 'Message sent successfully',
      data: populatedMessage
    });

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      message: 'Error sending message',
      error: error.message
    });
  }
};

// Get messages by chat
export const getMessagesByChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 50, before, after } = req.query;
    const userId = req.userId;

    // Build query
    const query = {
      chat: chatId,
      isDeleted: false
    };

    // Add date filters if provided
    if (before) {
      query.createdAt = { ...query.createdAt, $lt: new Date(before) };
    }
    if (after) {
      query.createdAt = { ...query.createdAt, $gt: new Date(after) };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await Message.find(query)
      .populate('sender', 'name email profilePicture')
      .populate('replyTo', 'content sender')
      .populate({
        path: 'replyTo',
        populate: {
          path: 'sender',
          select: 'name email profilePicture'
        }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalMessages = await Message.countDocuments(query);

    // Mark messages as read by the requesting user
    const unreadMessageIds = messages
      .filter(msg => !msg.isReadBy(userId))
      .map(msg => msg._id);

    if (unreadMessageIds.length > 0) {
      await Message.updateMany(
        { _id: { $in: unreadMessageIds } },
        { $addToSet: { readBy: { user: userId, readAt: new Date() } } }
      );

      // Update user's last read time in chat
      await Chat.updateOne(
        { _id: chatId, 'participants.user': userId },
        { $set: { 'participants.$.lastReadAt': new Date() } }
      );
    }

    res.status(200).json({
      messages: messages.reverse(), // Reverse to show oldest first
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalMessages / parseInt(limit)),
        totalMessages,
        hasNextPage: skip + messages.length < totalMessages,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      message: 'Error fetching messages',
      error: error.message
    });
  }
};

// Get message by ID
export const getMessageById = async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId)
      .populate('sender', 'name email profilePicture')
      .populate('chat', 'name')
      .populate('replyTo', 'content sender')
      .populate({
        path: 'replyTo',
        populate: {
          path: 'sender',
          select: 'name email profilePicture'
        }
      });

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    res.status(200).json({ message });

  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({
      message: 'Error fetching message',
      error: error.message
    });
  }
};

// Edit message
export const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({
        message: 'Message content cannot be empty'
      });
    }

    const message = await Message.findById(messageId).populate('chat');
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if message editing is allowed in the chat
    if (!message.chat.settings.allowMessageEditing) {
      return res.status(403).json({
        message: 'Message editing is disabled for this chat'
      });
    }

    // Check if message is too old to edit (24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (message.createdAt < twentyFourHoursAgo) {
      return res.status(403).json({
        message: 'Cannot edit messages older than 24 hours'
      });
    }

    // Edit the message
    message.editContent(content.trim());
    await message.save();

    const updatedMessage = await Message.findById(messageId)
      .populate('sender', 'name email profilePicture')
      .populate('replyTo', 'content sender')
      .populate({
        path: 'replyTo',
        populate: {
          path: 'sender',
          select: 'name email profilePicture'
        }
      });

    // Broadcast message update in real-time
    broadcastMessageUpdate(message.chat._id, messageId, 'edited', updatedMessage);

    res.status(200).json({
      message: 'Message edited successfully',
      data: updatedMessage
    });

  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({
      message: 'Error editing message',
      error: error.message
    });
  }
};

// Delete message
export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.userId;

    const message = await Message.findById(messageId).populate('chat');
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if message deletion is allowed in the chat
    if (!message.chat.settings.allowMessageDeletion) {
      return res.status(403).json({
        message: 'Message deletion is disabled for this chat'
      });
    }

    // Soft delete the message
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.deletedBy = userId;
    await message.save();

    // Delete associated files
    if (message.attachments && message.attachments.length > 0) {
      message.attachments.forEach(attachment => {
        const filePath = path.join(process.cwd(), 'uploads', 'chats', attachment.fileUrl.split('/').pop());
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }

    // Broadcast message deletion in real-time
    broadcastMessageUpdate(message.chat._id, messageId, 'deleted', { messageId, deletedBy: userId });

    res.status(200).json({
      message: 'Message deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({
      message: 'Error deleting message',
      error: error.message
    });
  }
};

// Mark message as read
export const markMessageAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.userId;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Mark as read
    message.markAsRead(userId);
    await message.save();

    // Update user's last read time in chat
    await Chat.updateOne(
      { _id: message.chat, 'participants.user': userId },
      { $set: { 'participants.$.lastReadAt': new Date() } }
    );

    res.status(200).json({
      message: 'Message marked as read'
    });

  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({
      message: 'Error marking message as read',
      error: error.message
    });
  }
};

// Add reaction to message
export const addReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.userId;

    if (!emoji) {
      return res.status(400).json({ message: 'Emoji is required' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    message.addReaction(userId, emoji);
    await message.save();

    // Broadcast reaction update in real-time
    broadcastMessageUpdate(message.chat, messageId, 'reaction-added', { 
      messageId, 
      userId, 
      emoji, 
      reactions: message.reactions 
    });

    res.status(200).json({
      message: 'Reaction added successfully',
      reactions: message.reactions
    });

  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({
      message: 'Error adding reaction',
      error: error.message
    });
  }
};

// Remove reaction from message
export const removeReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.userId;

    if (!emoji) {
      return res.status(400).json({ message: 'Emoji is required' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    message.removeReaction(userId, emoji);
    await message.save();

    // Broadcast reaction removal in real-time
    broadcastMessageUpdate(message.chat, messageId, 'reaction-removed', { 
      messageId, 
      userId, 
      emoji, 
      reactions: message.reactions 
    });

    res.status(200).json({
      message: 'Reaction removed successfully',
      reactions: message.reactions
    });

  } catch (error) {
    console.error('Error removing reaction:', error);
    res.status(500).json({
      message: 'Error removing reaction',
      error: error.message
    });
  }
};

// Search messages
export const searchMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { query, page = 1, limit = 20 } = req.query;

    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const searchQuery = {
      chat: chatId,
      isDeleted: false,
      $text: { $search: query.trim() }
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await Message.find(searchQuery)
      .populate('sender', 'name email profilePicture')
      .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalMessages = await Message.countDocuments(searchQuery);

    res.status(200).json({
      messages,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalMessages / parseInt(limit)),
        totalMessages,
        hasNextPage: skip + messages.length < totalMessages,
        hasPrevPage: parseInt(page) > 1
      },
      query: query.trim()
    });

  } catch (error) {
    console.error('Error searching messages:', error);
    res.status(500).json({
      message: 'Error searching messages',
      error: error.message
    });
  }
};