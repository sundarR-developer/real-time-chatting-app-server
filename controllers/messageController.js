import Message from '../models/Message.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

// NEW: Get messages between two specific users
const getMessagesBetweenUsers = async (req, res, next) => {
  try {
    const { userId1, userId2 } = req.params;
    const currentUserId = req.user._id.toString();

    console.log('Fetching messages between:', userId1, 'and', userId2, 'for user:', currentUserId);

    // Validate that current user is one of the users in the conversation
    if (currentUserId !== userId1 && currentUserId !== userId2) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this conversation'
      });
    }

    // Convert string IDs to ObjectId
    const objectId1 = new mongoose.Types.ObjectId(userId1);
    const objectId2 = new mongoose.Types.ObjectId(userId2);

    console.log('Converted IDs:', objectId1, objectId2);

    // Get messages between these two users with proper population
    const messages = await Message.find({
      $or: [
        { sender: objectId1, receiver: objectId2 },
        { sender: objectId2, receiver: objectId1 }
      ]
    })
    .populate('sender', 'username email profilePicture isOnline')
    .populate('receiver', 'username email profilePicture isOnline')
    .sort({ timestamp: 1 }) // Oldest first for chronological order
    .lean() // Convert to plain JavaScript objects
    .exec();

    console.log(`Found ${messages.length} messages between ${userId1} and ${userId2}`);

    // Check if population worked
    if (messages.length > 0) {
      console.log('First message sample:', {
        id: messages[0]._id,
        sender: messages[0].sender,
        receiver: messages[0].receiver,
        message: messages[0].message
      });
    }

    // If population failed, manually populate user data
    const processedMessages = await Promise.all(
      messages.map(async (message) => {
        // If sender is not populated (it's an ObjectId or string)
        if (!message.sender || typeof message.sender === 'string' || message.sender._id === undefined) {
          try {
            const senderId = message.sender || message.sender;
            const senderUser = await User.findById(senderId).select('username email profilePicture isOnline');
            message.sender = senderUser || {
              _id: senderId,
              username: 'Unknown User',
              email: '',
              isOnline: false
            };
          } catch (error) {
            console.error('Error populating sender:', error);
            message.sender = {
              _id: message.sender,
              username: 'Unknown User',
              email: '',
              isOnline: false
            };
          }
        }

        // If receiver is not populated
        if (!message.receiver || typeof message.receiver === 'string' || message.receiver._id === undefined) {
          try {
            const receiverId = message.receiver || message.receiver;
            const receiverUser = await User.findById(receiverId).select('username email profilePicture isOnline');
            message.receiver = receiverUser || {
              _id: receiverId,
              username: 'Unknown User',
              email: '',
              isOnline: false
            };
          } catch (error) {
            console.error('Error populating receiver:', error);
            message.receiver = {
              _id: message.receiver,
              username: 'Unknown User',
              email: '',
              isOnline: false
            };
          }
        }

        return message;
      })
    );

    res.json({
      success: true,
      messages: processedMessages
    });
  } catch (error) {
    console.error('Error in getMessagesBetweenUsers:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch messages',
      details: error.message 
    });
  }
};

// Get conversation between two users
const getConversation = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    // Validate that the user exists
    const otherUser = await User.findById(userId);
    if (!otherUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const messages = await Message.getConversation(
      req.user._id,
      userId,
      parseInt(limit),
      parseInt(skip)
    );

    // Mark messages as read
    await Message.updateMany(
      {
        sender: userId,
        receiver: req.user._id,
        read: false
      },
      {
        read: true,
        readAt: new Date()
      }
    );

    res.json({
      success: true,
      count: messages.length,
      messages: messages.reverse() // Return in chronological order
    });
  } catch (error) {
    next(error);
  }
};

// Get recent conversations
const getRecentConversations = async (req, res, next) => {
  try {
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: req.user._id },
            { receiver: req.user._id }
          ]
        }
      },
      {
        $sort: { timestamp: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', req.user._id] },
              '$receiver',
              '$sender'
            ]
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                { 
                  $and: [
                    { $eq: ['$receiver', req.user._id] },
                    { $eq: ['$read', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          'user.password': 0,
          'user.__v': 0
        }
      },
      {
        $sort: { 'lastMessage.timestamp': -1 }
      }
    ]);

    res.json({
      success: true,
      count: conversations.length,
      conversations
    });
  } catch (error) {
    next(error);
  }
};

// Send message
const sendMessage = async (req, res, next) => {
  try {
    const { receiver, message, messageType = 'text' } = req.body;

    // Check if receiver exists
    const receiverUser = await User.findById(receiver);
    if (!receiverUser) {
      return res.status(404).json({
        success: false,
        error: 'Receiver user not found'
      });
    }

    const newMessage = new Message({
      sender: req.user._id,
      receiver,
      message,
      messageType,
      timestamp: new Date()
    });

    await newMessage.save();
    
    // Manually populate with user data to ensure it works
    const senderUser = await User.findById(req.user._id).select('username email profilePicture isOnline');
    const populatedReceiverUser = await User.findById(receiver).select('username email profilePicture isOnline');
    
    const populatedMessage = {
      ...newMessage.toObject(),
      sender: senderUser,
      receiver: populatedReceiverUser
    };

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: populatedMessage
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message',
      details: error.message
    });
  }
};

// Mark messages as read
const markMessagesAsRead = async (req, res, next) => {
  try {
    const { sender } = req.body;

    const result = await Message.updateMany(
      {
        sender: sender,
        receiver: req.user._id,
        read: false
      },
      {
        read: true,
        readAt: new Date()
      }
    );

    res.json({
      success: true,
      message: 'Messages marked as read',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    next(error);
  }
};

// Get unread messages count
const getUnreadCount = async (req, res, next) => {
  try {
    const unreadCounts = await Message.getUnreadCount(req.user._id);

    res.json({
      success: true,
      unreadCounts
    });
  } catch (error) {
    next(error);
  }
};

export {
  getConversation,
  getRecentConversations,
  sendMessage,
  markMessagesAsRead,
  getUnreadCount,
  getMessagesBetweenUsers
};