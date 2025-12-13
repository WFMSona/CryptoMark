import { Router } from 'express';
import { registerUser, loginUser, setAutoRecord, getAutoRecord } from '../services/auth.js';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    if (username.length < 3 || username.length > 20) {
      res.status(400).json({ error: 'Username must be 3-20 characters' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const result = await registerUser(username, password);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    res.status(400).json({ error: message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    const result = await loginUser(username, password);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed';
    res.status(401).json({ error: message });
  }
});

router.get('/settings', authMiddleware, (req: AuthenticatedRequest, res) => {
  const autoRecord = getAutoRecord(req.user!.userId);
  res.json({ autoRecord });
});

router.post('/settings', authMiddleware, (req: AuthenticatedRequest, res) => {
  const { autoRecord } = req.body;
  if (typeof autoRecord === 'boolean') {
    setAutoRecord(req.user!.userId, autoRecord);
  }
  res.json({ success: true });
});

export default router;
