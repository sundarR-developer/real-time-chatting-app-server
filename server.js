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

// Socket.io configuration
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.log('❌ MongoDB connection error:', err));

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

// Message Schema
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

// Routes

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Chat server is running',
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
        error: 'Username, email, and password are required' 
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ 
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
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
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
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Get all users
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const users = await User.find(
      { _id: { $ne: req.user.userId } }
    ).select('username email isOnline lastSeen createdAt');
    
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
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
    
    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Logout
app.post('/api/logout', authenticateToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.userId, { 
      isOnline: false,
      lastSeen: new Date()
    });
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Friend Routes

// Send friend request
app.post('/api/friends/send-request', authenticateToken, async (req, res) => {
  try {
    const { toUserId } = req.body;
    
    const toUser = await User.findById(toUserId);
    if (!toUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if request already exists
    const existingRequest = toUser.friendRequests.find(
      req => req.from.toString() === req.user.userId && req.status === 'pending'
    );

    if (existingRequest) {
      return res.status(400).json({ error: 'Friend request already sent' });
    }

    // Check if already friends
    const currentUser = await User.findById(req.user.userId);
    const existingFriend = currentUser.friends.find(
      friend => friend.user.toString() === toUserId && friend.status === 'accepted'
    );

    if (existingFriend) {
      return res.status(400).json({ error: 'Already friends with this user' });
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

    res.json({ message: 'Friend request sent successfully' });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
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
      return res.status(404).json({ error: 'Friend request not found' });
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

    res.json({ message: 'Friend request accepted successfully' });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
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

    res.json({ message: 'Friend request rejected successfully' });
  } catch (error) {
    console.error('Reject friend request error:', error);
    res.status(500).json({ error: 'Failed to reject friend request' });
  }
});

// Get friend requests
app.get('/api/friends/requests', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .populate('friendRequests.from', 'username email')
      .select('friendRequests');

    res.json({ friendRequests: user.friendRequests });
  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({ error: 'Failed to get friend requests' });
  }
});

// Get friends list
app.get('/api/friends/list', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .populate('friends.user', 'username email isOnline lastSeen')
      .select('friends');

    const friends = user.friends.filter(friend => friend.status === 'accepted');
    
    res.json({ friends });
  } catch (error) {
    console.error('Get friends list error:', error);
    res.status(500).json({ error: 'Failed to get friends list' });
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

    res.json({ message: 'Friend removed successfully' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// Notification Routes

// Get all notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .populate('notifications.from', 'username')
      .select('notifications');

    res.json({ notifications: user.notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
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

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
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

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
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

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Clear all notifications
app.delete('/api/notifications', authenticateToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.userId, {
      $set: { notifications: [] }
    });

    res.json({ message: 'All notifications cleared' });
  } catch (error) {
    console.error('Clear all notifications error:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

// Socket.io for real-time messaging
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
      
      const isFriend = senderUser.friends.some(
        friend => friend.user.toString() === receiver && friend.status === 'accepted'
      );

      if (!isFriend) {
        socket.emit('message_error', { 
          error: 'You can only send messages to friends. Send a friend request first.' 
        });
        return;
      }

      const newMessage = new Message({ 
        sender, 
        receiver, 
        message,
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
      console.error('Error saving message:', error);
      socket.emit('message_error', { error: 'Failed to send message' });
    }
  });

  socket.on('typing_start', (data) => {
    socket.broadcast.emit('user_typing', data);
  });

  socket.on('typing_stop', (data) => {
    socket.broadcast.emit('user_stop_typing', data);
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API URL: http://localhost:${PORT}/api`);
  console.log(`❤️  Health check: http://localhost:${PORT}/api/health`);
});