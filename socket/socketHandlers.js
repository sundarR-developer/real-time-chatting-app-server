import Message from '../models/Message.js';
import User from '../models/User.js';

export const handleConnection = (socket) => {
  console.log(`User connected: ${socket.user.username} (${socket.id})`);

  // Join user to their personal room
  socket.join(socket.userId.toString());

  // Handle joining specific chat rooms
  socket.on('join_chat', (data) => {
    const { chatId } = data;
    socket.join(chatId);
    console.log(`User ${socket.user.username} joined chat: ${chatId}`);
  });

  // Handle leaving chat rooms
  socket.on('leave_chat', (data) => {
    const { chatId } = data;
    socket.leave(chatId);
    console.log(`User ${socket.user.username} left chat: ${chatId}`);
  });
};

export const handleDisconnect = (socket) => {
  return async () => {
    console.log(`User disconnected: ${socket.user.username} (${socket.id})`);

    try {
      // Update user status to offline
      await User.findByIdAndUpdate(socket.userId, {
        isOnline: false,
        lastSeen: new Date()
      });
    } catch (error) {
      console.error('Error updating user status on disconnect:', error);
    }
  };
};

export const handleMessage = (socket, io) => {
  return async (data) => {
    try {
      const { receiverId, message, messageType = 'text' } = data;

      if (!receiverId || !message) {
        socket.emit('error', { message: 'Receiver ID and message are required' });
        return;
      }

      // Create new message
      const newMessage = new Message({
        sender: socket.userId,
        receiver: receiverId,
        message,
        messageType
      });

      await newMessage.save();
      await newMessage.populate('sender', 'username profilePicture');
      await newMessage.populate('receiver', 'username profilePicture');

      // Emit to sender
      socket.emit('message_sent', newMessage);

      // Emit to receiver
      io.to(receiverId.toString()).emit('message_received', newMessage);

      // Emit to conversation room
      const roomId = [socket.userId, receiverId].sort().join('_');
      io.to(roomId).emit('new_message', newMessage);

    } catch (error) {
      console.error('Error handling message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  };
};

export const handleTyping = (socket, io) => {
  return (data) => {
    const { receiverId, isTyping } = data;
    
    if (receiverId) {
      io.to(receiverId.toString()).emit('user_typing', {
        senderId: socket.userId,
        senderUsername: socket.user.username,
        isTyping
      });
    }
  };
};

export const handleReadReceipt = (socket, io) => {
  return async (data) => {
    try {
      const { messageId } = data;

      const message = await Message.findById(messageId);
      
      if (message && message.receiver.toString() === socket.userId.toString()) {
        message.read = true;
        message.readAt = new Date();
        await message.save();

        // Notify sender that message was read
        io.to(message.sender.toString()).emit('message_read', {
          messageId: message._id,
          readAt: message.readAt,
          readerId: socket.userId,
          readerUsername: socket.user.username
        });
      }
    } catch (error) {
      console.error('Error handling read receipt:', error);
    }
  };
};