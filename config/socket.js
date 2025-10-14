import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import Message from '../models/Message.js';
import User from '../models/User.js';

let io;

const configureSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout: 60000,
  });

  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.userId = user._id;
      socket.username = user.username;
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔗 User connected: ${socket.username} (${socket.id})`);

    // Join user to their personal room
    socket.join(socket.userId.toString());

    // Update user online status
    User.findByIdAndUpdate(socket.userId, { isOnline: true }, { new: true })
      .then(user => {
        // Broadcast to all users that this user is online
        socket.broadcast.emit('user_online', {
          userId: user._id,
          username: user.username,
          isOnline: true
        });
      })
      .catch(error => {
        console.error('Error updating user online status:', error);
      });

    // Handle joining a chat room
    socket.on('join_chat', (data) => {
      const { targetUserId } = data;
      const roomId = [socket.userId, targetUserId].sort().join('_');
      socket.join(roomId);
      console.log(`User ${socket.username} joined room: ${roomId}`);
    });

    // Handle sending messages
    socket.on('send_message', async (data) => {
      try {
        const { receiver, message, messageType = 'text' } = data;
        
        if (!receiver || !message) {
          socket.emit('message_error', { error: 'Receiver and message are required' });
          return;
        }

        // Create new message
        const newMessage = new Message({
          sender: socket.userId,
          receiver,
          message,
          messageType,
          timestamp: new Date()
        });

        await newMessage.save();

        // Populate sender info for the response
        await newMessage.populate('sender', 'username email');
        await newMessage.populate('receiver', 'username email');

        // Determine room ID for the conversation
        const roomId = [socket.userId, receiver].sort().join('_');

        // Emit to both users in the conversation
        io.to(roomId).emit('receive_message', newMessage);

        // Also emit to individual users for real-time updates
        io.to(socket.userId.toString()).emit('message_sent', newMessage);
        io.to(receiver.toString()).emit('receive_message', newMessage);

        console.log(`💬 Message from ${socket.username} to ${receiver}: ${message}`);

      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('message_error', { error: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      const { receiver } = data;
      socket.to(receiver.toString()).emit('user_typing', {
        sender: socket.userId,
        username: socket.username,
        isTyping: true
      });
    });

    socket.on('typing_stop', (data) => {
      const { receiver } = data;
      socket.to(receiver.toString()).emit('user_typing', {
        sender: socket.userId,
        username: socket.username,
        isTyping: false
      });
    });

    // Handle message read receipts
    socket.on('mark_messages_read', async (data) => {
      try {
        const { sender } = data;
        
        await Message.updateMany(
          {
            sender: sender,
            receiver: socket.userId,
            read: false
          },
          {
            read: true,
            readAt: new Date()
          }
        );

        // Notify the sender that messages were read
        socket.to(sender.toString()).emit('messages_read', {
          reader: socket.userId,
          readerUsername: socket.username
        });

      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log(`🔌 User disconnected: ${socket.username} (${socket.id})`);

      try {
        // Update user offline status
        await User.findByIdAndUpdate(socket.userId, { 
          isOnline: false,
          lastSeen: new Date()
        });

        // Broadcast to all users that this user is offline
        socket.broadcast.emit('user_offline', {
          userId: socket.userId,
          username: socket.username,
          isOnline: false,
          lastSeen: new Date()
        });
      } catch (error) {
        console.error('Error updating user offline status:', error);
      }
    });

    // Handle connection errors
    socket.on('error', (error) => {
      console.error(`Socket error for user ${socket.username}:`, error);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

export { configureSocket, getIO };