import express from 'express';
import mongoose from 'mongoose';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const server = http.createServer(app);

// CORS Configuration - UPDATED
const allowedOrigins = [
  "http://localhost:5173",
  "https://wondrous-macaron-0d4ee2.netlify.app",
  "https://classy-cajeta-cac797.netlify.app",
  "https://incredible-heliotrope-c840e6.netlify.app",
  process.env.CLIENT_URL
].filter(Boolean);

// Socket.io configuration - UPDATED
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware - UPDATED
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('🚫 Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// MongoDB Connection (FIXED - removed deprecated options)
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app');
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

connectDB();

// MongoDB connection events
mongoose.connection.on('connected', () => {
  console.log('✅ Mongoose connected to MongoDB cluster');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
});

// User Schema
const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6
  },
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  friends: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'blocked'],
      default: 'pending'
    },
    createdAt: { type: Date, default: Date.now }
  }],
  friendRequests: [{
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    },
    createdAt: { type: Date, default: Date.now }
  }],
  notifications: [{
    type: {
      type: String,
      enum: ['friend_request', 'message', 'system'],
      required: true
    },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }]
}, { 
  timestamps: true 
});

// Message Schema - UPDATED with messageType
const messageSchema = new mongoose.Schema({
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true
  },
  receiver: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true
  },
  message: { 
    type: String, 
    required: true,
    maxlength: 1000
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file'],
    default: 'text'
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
  read: { 
    type: Boolean, 
    default: false 
  }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// ==================== ROUTES ====================

// Root route - ADDED
app.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: 'Real Time Chat App Backend Server is running!',
    service: 'Chat Application API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      api: '/api',
      register: 'POST /api/register',
      login: 'POST /api/login',
      documentation: 'Check README for complete API documentation'
    }
  });
});

// API base route - ADDED
app.get('/api', (req, res) => {
  res.json({ 
    success: true,
    message: 'Chat App API is working!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    available_endpoints: {
      auth: {
        register: 'POST /api/register',
        login: 'POST /api/login',
        logout: 'POST /api/logout'
      },
      users: 'GET /api/users',
      messages: {
        send: 'POST /api/messages/send',
        get: 'GET /api/messages/:user1/:user2'
      },
      friends: {
        send_request: 'POST /api/friends/send-request',
        accept_request: 'POST /api/friends/accept-request',
        reject_request: 'POST /api/friends/reject-request',
        requests: 'GET /api/friends/requests',
        list: 'GET /api/friends/list',
        remove: 'DELETE /api/friends/remove/:friendId'
      },
      notifications: {
        list: 'GET /api/notifications',
        mark_read: 'PUT /api/notifications/:notificationId/read',
        mark_all_read: 'PUT /api/notifications/read-all',
        delete: 'DELETE /api/notifications/:notificationId',
        clear_all: 'DELETE /api/notifications'
      },
      health: 'GET /api/health'
    }
  });
});

// Health check endpoint - ENHANCED
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
  const dbStatusText = {
    0: 'Disconnected',
    1: 'Connected',
    2: 'Connecting',
    3: 'Disconnecting'
  }[mongoose.connection.readyState];
  
  res.json({ 
    success: true,
    status: 'OK', 
    message: 'Chat server is running healthy',
    database: {
      status: dbStatus,
      statusText: dbStatusText,
      connection: mongoose.connection.readyState === 1 ? 'Healthy' : 'Unhealthy'
    },
    server: {
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 5000,
      uptime: `${process.uptime().toFixed(2)} seconds`
    },
    timestamp: new Date().toISOString()
  });
});

// Register endpoint
app.post('/api/register', async (req, res) => {
  try {
    console.log('Registration request received:', req.body);
    
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Username, email, and password are required' 
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: 'User with this email or username already exists' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = new User({ 
      username, 
      email, 
      password: hashedPassword 
    });
    
    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id, username: user.username }, 
      process.env.JWT_SECRET || 'fallback_secret', 
      { expiresIn: '7d' }
    );

    console.log('User registered successfully:', user.username);
    
    res.status(201).json({ 
      success: true,
      message: 'User created successfully', 
      user: { 
        id: user._id, 
        username: user.username, 
        email: user.email 
      },
      token 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error during registration' 
    });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }

    // Update online status
    user.isOnline = true;
    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id, username: user.username }, 
      process.env.JWT_SECRET || 'fallback_secret', 
      { expiresIn: '7d' }
    );

    res.json({ 
      success: true,
      message: 'Login successful', 
      user: { 
        id: user._id, 
        username: user.username, 
        email: user.email,
        isOnline: user.isOnline
      },
      token 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error during login' 
    });
  }
});

// Get all users
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const users = await User.find(
      { _id: { $ne: req.user.userId } }
    ).select('username email isOnline lastSeen createdAt');
    
    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch users' 
    });
  }
});

// Get messages between two users
app.get('/api/messages/:user1/:user2', authenticateToken, async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    
    const messages = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    })
    .populate('sender', 'username')
    .populate('receiver', 'username')
    .sort({ timestamp: 1 });
    
    res.json({
      success: true,
      messages
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch messages' 
    });
  }
});

// Send message endpoint - ADDED
app.post('/api/messages/send', authenticateToken, async (req, res) => {
  try {
    const { receiver, message, messageType = 'text' } = req.body;

    if (!receiver || !message) {
      return res.status(400).json({ 
        success: false,
        error: 'Receiver and message are required' 
      });
    }

    // Check if users are friends
    const senderUser = await User.findById(req.user.userId);
    const receiverUser = await User.findById(receiver);

    if (!receiverUser) {
      return res.status(404).json({ 
        success: false,
        error: 'Receiver user not found' 
      });
    }

    const isFriend = senderUser.friends.some(
      friend => friend.user.toString() === receiver && friend.status === 'accepted'
    );

    if (!isFriend) {
      return res.status(400).json({ 
        success: false,
        error: 'You can only send messages to friends. Send a friend request first.' 
      });
    }

    // Create and save message
    const newMessage = new Message({ 
      sender: req.user.userId, 
      receiver, 
      message,
      messageType,
      timestamp: new Date()
    });
    
    await newMessage.save();
    
    // Populate sender/receiver info
    await newMessage.populate('sender', 'username email isOnline');
    await newMessage.populate('receiver', 'username email isOnline');

    // Create notification for receiver
    receiverUser.notifications.push({
      type: 'message',
      from: req.user.userId,
      message: `New message from ${senderUser.username}`,
      read: false
    });
    await receiverUser.save();

    // Emit notification via socket
    io.emit('new_notification', {
      userId: receiver,
      type: 'message',
      message: `New message from ${senderUser.username}`
    });

    // Emit the message via socket for real-time delivery
    io.emit('receive_message', newMessage);

    console.log(`💬 Message saved from ${senderUser.username} to ${receiverUser.username}`);

    res.json({ 
      success: true,
      message: 'Message sent successfully',
      data: newMessage
    });
    
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to send message' 
    });
  }
});

// Logout
app.post('/api/logout', authenticateToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.userId, { 
      isOnline: false,
      lastSeen: new Date()
    });
    res.json({ 
      success: true,
      message: 'Logout successful' 
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Logout failed' 
    });
  }
});

// Friend Routes

// Send friend request
app.post('/api/friends/send-request', authenticateToken, async (req, res) => {
  try {
    const { toUserId } = req.body;
    
    const toUser = await User.findById(toUserId);
    if (!toUser) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    // Check if request already exists
    const existingRequest = toUser.friendRequests.find(
      req => req.from.toString() === req.user.userId && req.status === 'pending'
    );

    if (existingRequest) {
      return res.status(400).json({ 
        success: false,
        error: 'Friend request already sent' 
      });
    }

    // Check if already friends
    const currentUser = await User.findById(req.user.userId);
    const existingFriend = currentUser.friends.find(
      friend => friend.user.toString() === toUserId && friend.status === 'accepted'
    );

    if (existingFriend) {
      return res.status(400).json({ 
        success: false,
        error: 'Already friends with this user' 
      });
    }

    // Add friend request to recipient
    toUser.friendRequests.push({
      from: req.user.userId,
      status: 'pending'
    });

    // Add notification
    toUser.notifications.push({
      type: 'friend_request',
      from: req.user.userId,
      message: `${req.user.username} sent you a friend request`,
      read: false
    });

    await toUser.save();

    // Emit notification via socket
    io.emit('new_notification', {
      userId: toUserId,
      type: 'friend_request',
      message: `${req.user.username} sent you a friend request`
    });

    res.json({ 
      success: true,
      message: 'Friend request sent successfully' 
    });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to send friend request' 
    });
  }
});

// Accept friend request
app.post('/api/friends/accept-request', authenticateToken, async (req, res) => {
  try {
    const { fromUserId } = req.body;

    const currentUser = await User.findById(req.user.userId);
    
    // Find the friend request
    const friendRequest = currentUser.friendRequests.find(
      req => req.from.toString() === fromUserId && req.status === 'pending'
    );

    if (!friendRequest) {
      return res.status(404).json({ 
        success: false,
        error: 'Friend request not found' 
      });
    }

    // Update request status
    friendRequest.status = 'accepted';

    // Add to friends list for both users
    currentUser.friends.push({
      user: fromUserId,
      status: 'accepted'
    });

    const fromUser = await User.findById(fromUserId);
    fromUser.friends.push({
      user: req.user.userId,
      status: 'accepted'
    });

    // Remove from pending requests
    currentUser.friendRequests = currentUser.friendRequests.filter(
      req => !(req.from.toString() === fromUserId && req.status === 'pending')
    );

    // Add notification to requester
    fromUser.notifications.push({
      type: 'friend_request',
      from: req.user.userId,
      message: `${req.user.username} accepted your friend request`,
      read: false
    });

    await currentUser.save();
    await fromUser.save();

    // Emit notifications
    io.emit('new_notification', {
      userId: fromUserId,
      type: 'friend_request',
      message: `${req.user.username} accepted your friend request`
    });

    res.json({ 
      success: true,
      message: 'Friend request accepted successfully' 
    });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to accept friend request' 
    });
  }
});

// Reject friend request
app.post('/api/friends/reject-request', authenticateToken, async (req, res) => {
  try {
    const { fromUserId } = req.body;

    const currentUser = await User.findById(req.user.userId);
    
    // Remove the friend request
    currentUser.friendRequests = currentUser.friendRequests.filter(
      req => !(req.from.toString() === fromUserId && req.status === 'pending')
    );

    await currentUser.save();

    res.json({ 
      success: true,
      message: 'Friend request rejected successfully' 
    });
  } catch (error) {
    console.error('Reject friend request error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to reject friend request' 
    });
  }
});

// Get friend requests
app.get('/api/friends/requests', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .populate('friendRequests.from', 'username email')
      .select('friendRequests');

    res.json({ 
      success: true,
      friendRequests: user.friendRequests 
    });
  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get friend requests' 
    });
  }
});

// Get friends list
app.get('/api/friends/list', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .populate('friends.user', 'username email isOnline lastSeen')
      .select('friends');

    const friends = user.friends.filter(friend => friend.status === 'accepted');
    
    res.json({ 
      success: true,
      friends 
    });
  } catch (error) {
    console.error('Get friends list error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get friends list' 
    });
  }
});

// Remove friend
app.delete('/api/friends/remove/:friendId', authenticateToken, async (req, res) => {
  try {
    const { friendId } = req.params;

    const currentUser = await User.findById(req.user.userId);
    
    // Remove from current user's friends
    currentUser.friends = currentUser.friends.filter(
      friend => friend.user.toString() !== friendId
    );

    // Remove from friend's friends list
    const friendUser = await User.findById(friendId);
    friendUser.friends = friendUser.friends.filter(
      friend => friend.user.toString() !== req.user.userId
    );

    await currentUser.save();
    await friendUser.save();

    res.json({ 
      success: true,
      message: 'Friend removed successfully' 
    });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to remove friend' 
    });
  }
});

// Notification Routes

// Get all notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .populate('notifications.from', 'username')
      .select('notifications');

    res.json({ 
      success: true,
      notifications: user.notifications 
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get notifications' 
    });
  }
});

// Mark notification as read
app.put('/api/notifications/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const user = await User.findById(req.user.userId);
    const notification = user.notifications.id(notificationId);
    
    if (notification) {
      notification.read = true;
      await user.save();
    }

    res.json({ 
      success: true,
      message: 'Notification marked as read' 
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to mark notification as read' 
    });
  }
});

// Mark all notifications as read
app.put('/api/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    user.notifications.forEach(notification => {
      notification.read = true;
    });
    await user.save();

    res.json({ 
      success: true,
      message: 'All notifications marked as read' 
    });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to mark all notifications as read' 
    });
  }
});

// Delete notification
app.delete('/api/notifications/:notificationId', authenticateToken, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const user = await User.findById(req.user.userId);
    user.notifications = user.notifications.filter(
      notif => notif._id.toString() !== notificationId
    );
    await user.save();

    res.json({ 
      success: true,
      message: 'Notification deleted successfully' 
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete notification' 
    });
  }
});

// Clear all notifications
app.delete('/api/notifications', authenticateToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.userId, {
      $set: { notifications: [] }
    });

    res.json({ 
      success: true,
      message: 'All notifications cleared' 
    });
  } catch (error) {
    console.error('Clear all notifications error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to clear notifications' 
    });
  }
});

// Socket.io for real-time messaging - UPDATED
io.on('connection', (socket) => {
  console.log('🔗 User connected:', socket.id);

  socket.on('user_online', (userData) => {
    console.log(`🟢 ${userData.username} is online`);
    socket.broadcast.emit('user_status_change', {
      userId: userData.id,
      username: userData.username,
      isOnline: true
    });
  });

  socket.on('send_message', async (data) => {
    try {
      const { sender, receiver, message } = data;
      
      // Check if users are friends
      const senderUser = await User.findById(sender);
      const receiverUser = await User.findById(receiver);
      
      if (!senderUser || !receiverUser) {
        socket.emit('message_error', { 
          error: 'User not found' 
        });
        return;
      }

      const isFriend = senderUser.friends.some(
        friend => friend.user.toString() === receiver && friend.status === 'accepted'
      );

      if (!isFriend) {
        socket.emit('message_error', { 
          error: 'You can only send messages to friends. Send a friend request first.' 
        });
        return;
      }

      // Save message to database
      const newMessage = new Message({ 
        sender, 
        receiver, 
        message,
        messageType: 'text', // Default for socket messages
        timestamp: new Date()
      });
      
      await newMessage.save();
      await newMessage.populate('sender', 'username');
      await newMessage.populate('receiver', 'username');

      // Create notification for receiver
      receiverUser.notifications.push({
        type: 'message',
        from: sender,
        message: `New message from ${senderUser.username}`,
        read: false
      });
      await receiverUser.save();

      // Emit notification
      io.emit('new_notification', {
        userId: receiver,
        type: 'message',
        message: `New message from ${senderUser.username}`
      });

      // Emit to both users
      io.emit('receive_message', newMessage);
      
      console.log(`💬 Message from ${senderUser.username} to ${receiverUser.username}`);
    } catch (error) {
      console.error('Error saving message via socket:', error);
      socket.emit('message_error', { error: 'Failed to send message' });
    }
  });

  socket.on('typing_start', (data) => {
    socket.broadcast.emit('user_typing', {
      ...data,
      isTyping: true
    });
  });

  socket.on('typing_stop', (data) => {
    socket.broadcast.emit('user_typing', {
      ...data,
      isTyping: false
    });
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

// 404 handler for undefined API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'API route not found',
    requestedUrl: req.originalUrl,
    availableEndpoints: {
      root: 'GET /',
      api: 'GET /api',
      health: 'GET /api/health',
      auth: ['POST /api/register', 'POST /api/login', 'POST /api/logout'],
      messages: 'POST /api/messages/send',
      users: 'GET /api/users',
      friends: {
        send_request: 'POST /api/friends/send-request',
        accept_request: 'POST /api/friends/accept-request',
        reject_request: 'POST /api/friends/reject-request',
        requests: 'GET /api/friends/requests',
        list: 'GET /api/friends/list'
      }
    }
  });
});

// Global error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : error.message
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Real Time Chat App Server Started Successfully');
  console.log('='.repeat(60));
  console.log(`📍 Server running on port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️ Database: ${mongoose.connection.readyState === 1 ? 'Connected ✅' : 'Disconnected ❌'}`);
  console.log(`🔗 Root URL: http://localhost:${PORT}/`);
  console.log(`🔗 API URL: http://localhost:${PORT}/api`);
  console.log(`❤️ Health check: http://localhost:${PORT}/api/health`);
  console.log('='.repeat(60));
  console.log('Your chat service is live and ready! 💮\n');
});

// Graceful shutdown handling
const gracefulShutdown = () => {
  console.log('\n⚠️ Received shutdown signal, closing server gracefully...');
  
  server.close(() => {
    console.log('✅ HTTP server closed');
    
    mongoose.connection.close(false, () => {
      console.log('✅ MongoDB connection closed');
      console.log('👋 Server shutdown completed');
      process.exit(0);
    });
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Handle different shutdown signals
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export default app;