import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { connect, users } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

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
  const { _id, email, name, createdAt } = user;
  return { id: String(_id), email, name, createdAt };
}

function setSession(res, user) {
  const token = jwt.sign({}, config.jwtSecret, {
    algorithm: 'HS256', subject: String(user._id), expiresIn: '7d'
  });
  res.cookie(COOKIE_NAME, token, cookieOptions);
}

router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, password } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !email.trim() || typeof password !== 'string') {
      return res.status(400).json({ error: 'name, email and password are required.' });
    }
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const normalizedEmail = email.trim().toLowerCase();
    await connect();
    const existing = await users.findOne({ email: normalizedEmail });
    if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

    const user = {
      email: normalizedEmail,
      name: name.trim(),
      passwordHash: await bcrypt.hash(password, 10),
      createdAt: new Date()
    };
    try {
      const { insertedId } = await users.insertOne(user);
      user._id = insertedId;
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ error: 'An account with that email already exists.' });
      throw error;
    }
    setSession(res, user);
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

export default router;
