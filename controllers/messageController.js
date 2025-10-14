import Message from '../models/Message.js';
import User from '../models/User.js';

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
      messageType
    });

    await newMessage.save();
    await newMessage.populate('sender', 'username email profilePicture');
    await newMessage.populate('receiver', 'username email profilePicture');

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: newMessage
    });
  } catch (error) {
    next(error);
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
  getUnreadCount
};