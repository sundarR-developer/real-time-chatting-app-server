import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: [true, 'Sender is required'],
    index: true
  },
  receiver: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: [true, 'Receiver is required'],
    index: true
  },
  message: { 
    type: String, 
    required: [true, 'Message content is required'],
    trim: true,
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file'],
    default: 'text'
  },
  timestamp: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  read: { 
    type: Boolean, 
    default: false 
  },
  readAt: { 
    type: Date 
  },
  delivered: {
    type: Boolean,
    default: false
  },
  deliveredAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound index for efficient querying of conversations
messageSchema.index({ sender: 1, receiver: 1, timestamp: 1 });
messageSchema.index({ receiver: 1, sender: 1, timestamp: 1 });
messageSchema.index({ read: 1 });
messageSchema.index({ createdAt: 1 });

// Pre-save middleware to set delivered status
messageSchema.pre('save', function(next) {
  if (this.isNew) {
    this.delivered = true;
    this.deliveredAt = new Date();
  }
  next();
});

// Instance method to mark as read
messageSchema.methods.markAsRead = function() {
  this.read = true;
  this.readAt = new Date();
  return this.save();
};

// Static method to get conversation between two users
messageSchema.statics.getConversation = function(user1, user2, limit = 50, skip = 0) {
  return this.find({
    $or: [
      { sender: user1, receiver: user2 },
      { sender: user2, receiver: user1 }
    ]
  })
  .populate('sender', 'username email profilePicture')
  .populate('receiver', 'username email profilePicture')
  .sort({ timestamp: -1 })
  .limit(limit)
  .skip(skip)
  .exec();
};

// Static method to get unread messages for a user
messageSchema.statics.getUnreadCount = function(userId) {
  return this.aggregate([
    {
      $match: {
        receiver: userId,
        read: false
      }
    },
    {
      $group: {
        _id: '$sender',
        count: { $sum: 1 }
      }
    }
  ]);
};

const Message = mongoose.model('Message', messageSchema);

export default Message;