import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { connect, memberships, projects, users } from '../db.js';
import { requireAuth, userRateLimit } from '../middleware/auth.js';

const router = Router();
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('hindsight-dummy-password', 10);
const COOKIE_NAME = 'sid';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: COOKIE_MAX_AGE,
  path: '/'
};

function publicUser(user) {
  const { _id, email, username, createdAt } = user;
  return { id: String(_id), email, username, createdAt };
}

function setSession(res, user) {
  const token = jwt.sign({}, config.jwtSecret, {
    algorithm: 'HS256', subject: String(user._id), expiresIn: '7d', jwtid: String(user.sessionVersion ?? 0)
  });
  res.cookie(COOKIE_NAME, token, cookieOptions);
}

router.post('/signup', async (req, res, next) => {
  try {
    const { username, email, password } = req.body ?? {};
    if (typeof username !== 'string' || !username.trim() || typeof email !== 'string' || !email.trim() || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username, email and password are required.' });
    }
    const normalizedUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) return res.status(400).json({ error: 'Username must be 3–30 characters using letters, numbers or underscores.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const normalizedEmail = email.trim().toLowerCase();
    await connect();
    if (await users.findOne({ username: normalizedUsername }, { collation: { locale: 'en', strength: 2 } })) return res.status(409).json({ error: 'This username is already taken. Please choose another.' });
    const existing = await users.findOne({ email: normalizedEmail });
    if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

    const user = {
      email: normalizedEmail,
      username: normalizedUsername,
      passwordHash: await bcrypt.hash(password, 10),
      createdAt: new Date()
    };
    try {
      const { insertedId } = await users.insertOne(user);
      user._id = insertedId;
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ error: error.keyPattern?.username ? 'This username is already taken. Please choose another.' : 'An account with that email already exists.' });
      throw error;
    }
    setSession(res, user);
    const { insertedId: projectId } = await projects.insertOne({ name: `${user.username}'s workspace`, ownerId: user._id, createdAt: new Date() });
    await memberships.insertOne({ projectId, userId: user._id, role: 'owner', joinedAt: new Date(), invitedBy: user._id });
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) { return next(error); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'email and password are required.' });
    }
    await connect();
    const user = await users.findOne({ email: email.trim().toLowerCase() });
    const passwordMatches = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    if (!user || !passwordMatches) return res.status(401).json({ error: 'Invalid email or password.' });
    setSession(res, user);
    return res.json({ user: publicUser(user) });
  } catch (error) { return next(error); }
});

router.post('/logout', requireAuth, (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
  return res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

router.patch('/profile', requireAuth, userRateLimit, async (req, res, next) => {
  try {
    const { username, currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== 'string' || !await bcrypt.compare(currentPassword, req.user.passwordHash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    if (username === undefined && newPassword === undefined) return res.status(400).json({ error: 'Choose a username or password to update.' });
    const changes = {};
    if (username !== undefined) {
      if (typeof username !== 'string' || !/^[a-z0-9_]{3,30}$/.test(username.trim().toLowerCase())) {
        return res.status(400).json({ error: 'Username must be 3–30 characters using letters, numbers or underscores.' });
      }
      changes.username = username.trim().toLowerCase();
    }
    if (newPassword !== undefined) {
      if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 1024) return res.status(400).json({ error: 'New password must be 8–1024 characters.' });
      if (newPassword === currentPassword) return res.status(400).json({ error: 'Choose a different new password.' });
      changes.passwordHash = await bcrypt.hash(newPassword, 10);
      changes.sessionVersion = (req.user.sessionVersion ?? 0) + 1;
    }
    let updated;
    try {
      updated = await users.findOneAndUpdate({ _id: req.user._id }, { $set: changes }, { returnDocument: 'after' });
    } catch (error) {
      if (error.code === 11000 && error.keyPattern?.username) return res.status(409).json({ error: 'This username is already taken. Please choose another.' });
      throw error;
    }
    if (newPassword !== undefined) setSession(res, updated);
    return res.json({ user: publicUser(updated) });
  } catch (error) { return next(error); }
});

export default router;
