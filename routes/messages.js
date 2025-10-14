import express from 'express';
import {
  getConversation,
  getRecentConversations,
  sendMessage,
  markMessagesAsRead,
  getUnreadCount
} from '../controllers/messageController.js';
import { authenticate } from '../middleware/auth.js';
import { validateMessage } from '../middleware/validation.js';

const router = express.Router();

// All routes are protected
router.use(authenticate);

router.get('/conversation/:userId', getConversation);
router.get('/conversations/recent', getRecentConversations);
router.get('/unread/count', getUnreadCount);
router.post('/send', validateMessage, sendMessage);
router.post('/mark-read', markMessagesAsRead);

export default router;