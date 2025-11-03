import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import Chat from '../models/chat.js';
import Message from '../models/message.js';

let io;

// Initialize Socket.IO
export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? [process.env.FRONTEND_URL]
        : ['http://localhost:5173', 'http://127.0.0.1:2000'],
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).populate('workspaces.workspace');
      
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      socket.currentWorkspaceId = user.currentWorkspace?.toString();
      
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Handle connections
  io.on('connection', (socket) => {
    console.log(`🔌 User ${socket.user.name} connected (${socket.userId})`);

    // Join user to their personal room for notifications
    socket.join(`user:${socket.userId}`);

    // Join user to their workspace room
    if (socket.currentWorkspaceId) {
      socket.join(`workspace:${socket.currentWorkspaceId}`);
    }

    // Handle joining chat rooms
    socket.on('join-chat', async (chatId) => {
      try {
        // Verify user has access to this chat
        const chat = await Chat.findById(chatId);
        if (!chat) {
          socket.emit('error', { message: 'Chat not found' });
          return;
        }

        const isParticipant = chat.participants.some(
          p => p.user.toString() === socket.userId && p.isActive
        );

        if (!isParticipant) {
          socket.emit('error', { message: 'Access denied to this chat' });
          return;
        }

        socket.join(`chat:${chatId}`);
        socket.currentChatId = chatId;

        // Update user's last seen in chat
        await Chat.updateOne(
          { _id: chatId, 'participants.user': socket.userId },
          { $set: { 'participants.$.lastReadAt': new Date() } }
        );

        socket.emit('joined-chat', { chatId });
        console.log(`👥 User ${socket.user.name} joined chat ${chatId}`);

      } catch (error) {
        console.error('Error joining chat:', error);
        socket.emit('error', { message: 'Failed to join chat' });
      }
    });

    // Handle leaving chat rooms
    socket.on('leave-chat', (chatId) => {
      socket.leave(`chat:${chatId}`);
      if (socket.currentChatId === chatId) {
        socket.currentChatId = null;
      }
      socket.emit('left-chat', { chatId });
      console.log(`👋 User ${socket.user.name} left chat ${chatId}`);
    });

    // Handle typing indicators
    socket.on('typing-start', (chatId) => {
      if (socket.currentChatId === chatId) {
        socket.to(`chat:${chatId}`).emit('user-typing', {
          userId: socket.userId,
          userName: socket.user.name,
          chatId
        });
      }
    });

    socket.on('typing-stop', (chatId) => {
      if (socket.currentChatId === chatId) {
        socket.to(`chat:${chatId}`).emit('user-stopped-typing', {
          userId: socket.userId,
          chatId
        });
      }
    });

    // Handle message read receipts
    socket.on('mark-messages-read', async (data) => {
      try {
        const { chatId, messageIds } = data;

        if (socket.currentChatId !== chatId) {
          socket.emit('error', { message: 'Not in this chat' });
          return;
        }

        // Update read receipts for messages
        await Message.updateMany(
          { 
            _id: { $in: messageIds },
            chat: chatId,
            'readBy.user': { $ne: socket.userId }
          },
          { 
            $addToSet: { 
              readBy: { 
                user: socket.userId, 
                readAt: new Date() 
              } 
            } 
          }
        );

        // Update user's last read time in chat
        await Chat.updateOne(
          { _id: chatId, 'participants.user': socket.userId },
          { $set: { 'participants.$.lastReadAt': new Date() } }
        );

        // Notify other participants about read receipts
        socket.to(`chat:${chatId}`).emit('messages-read', {
          userId: socket.userId,
          userName: socket.user.name,
          messageIds,
          chatId
        });

      } catch (error) {
        console.error('Error marking messages as read:', error);
        socket.emit('error', { message: 'Failed to mark messages as read' });
      }
    });

    // Handle user presence updates
    socket.on('update-presence', (status) => {
      // Broadcast presence to workspace
      if (socket.currentWorkspaceId) {
        socket.to(`workspace:${socket.currentWorkspaceId}`).emit('user-presence-updated', {
          userId: socket.userId,
          userName: socket.user.name,
          status, // online, away, busy, offline
          lastSeen: new Date()
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`🔌 User ${socket.user.name} disconnected: ${reason}`);
      
      // Notify workspace about user going offline
      if (socket.currentWorkspaceId) {
        socket.to(`workspace:${socket.currentWorkspaceId}`).emit('user-presence-updated', {
          userId: socket.userId,
          userName: socket.user.name,
          status: 'offline',
          lastSeen: new Date()
        });
      }

      // Stop typing indicators if user was typing
      if (socket.currentChatId) {
        socket.to(`chat:${socket.currentChatId}`).emit('user-stopped-typing', {
          userId: socket.userId,
          chatId: socket.currentChatId
        });
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  console.log('🚀 Socket.IO server initialized');
  return io;
};

// Get Socket.IO instance
export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

// Broadcast new message to chat participants
export const broadcastMessage = (chatId, message, senderId) => {
  if (!io) return;
  
  io.to(`chat:${chatId}`).emit('new-message', {
    message,
    chatId,
    senderId
  });
};

// Broadcast message update (edit/delete)
export const broadcastMessageUpdate = (chatId, messageId, updateType, data) => {
  if (!io) return;
  
  io.to(`chat:${chatId}`).emit('message-updated', {
    messageId,
    chatId,
    updateType, // 'edited', 'deleted', 'reaction-added', 'reaction-removed'
    data
  });
};

// Broadcast chat updates (new chat, participant changes, etc.)
export const broadcastChatUpdate = (chatId, updateType, data, targetUsers = null) => {
  if (!io) return;
  
  if (targetUsers && Array.isArray(targetUsers)) {
    // Send to specific users
    targetUsers.forEach(userId => {
      io.to(`user:${userId}`).emit('chat-updated', {
        chatId,
        updateType, // 'created', 'updated', 'participant-added', 'participant-removed', 'deleted'
        data
      });
    });
  } else {
    // Send to all chat participants
    io.to(`chat:${chatId}`).emit('chat-updated', {
      chatId,
      updateType,
      data
    });
  }
};

// Send notification to specific user
export const sendNotificationToUser = (userId, notification) => {
  if (!io) return;
  
  io.to(`user:${userId}`).emit('notification', notification);
};

// Broadcast to workspace
export const broadcastToWorkspace = (workspaceId, event, data) => {
  if (!io) return;
  
  io.to(`workspace:${workspaceId}`).emit(event, data);
};

export default { initializeSocket, getIO, broadcastMessage, broadcastMessageUpdate, broadcastChatUpdate, sendNotificationToUser, broadcastToWorkspace };