import express from 'express';
import {
  getUsers,
  getUserById,
  searchUsers,
  updateProfile
} from '../controllers/userController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes are protected
router.use(authenticate);

router.get('/', getUsers);
router.get('/search', searchUsers);
router.get('/:id', getUserById);
router.put('/profile', updateProfile);

export default router;