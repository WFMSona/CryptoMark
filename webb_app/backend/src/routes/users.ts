import { Router } from 'express';
import { searchUsers } from '../services/auth.js';
import { wsManager } from '../services/websocket.js';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

router.get('/search', authMiddleware, (req: AuthenticatedRequest, res) => {
  const query = req.query.q as string;

  if (!query || query.length < 1) {
    res.json({ users: [] });
    return;
  }

  const users = searchUsers(query, req.user!.userId);
  
  // Add online status
  const usersWithStatus = users.map(user => ({
    ...user,
    online: wsManager.isUserOnline(user.id),
  }));

  res.json({ users: usersWithStatus });
});

export default router;
