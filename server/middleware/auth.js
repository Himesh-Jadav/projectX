import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { config } from '../config.js';
import { connect, memberships, users } from '../db.js';

export async function requireAuth(req, res, next) {
  const token = req.cookies?.sid;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || !ObjectId.isValid(payload.sub)) throw new Error('Invalid subject');
    await connect();
    const user = await users.findOne({ _id: new ObjectId(payload.sub) });
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Authentication required.' });
  }
}

export async function requireProjectMember(req, res, next) {
  try {
    const projectId = req.params.projectId;
    if (!ObjectId.isValid(projectId) || !req.user?._id) return res.status(404).json({ error: 'Project not found.' });
    await connect();
    const membership = await memberships.findOne({ projectId: new ObjectId(projectId), userId: req.user._id });
    if (!membership) return res.status(404).json({ error: 'Project not found.' });
    req.membership = membership;
    return next();
  } catch (error) { return next(error); }
}

export function requireOwner(req, res, next) {
  if (req.membership?.role !== 'owner') return res.status(403).json({ error: 'Project owner access required.' });
  return next();
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const buckets = new Map();

// Attach after requireAuth. Counts requests per user in this process.
export function userRateLimit(req, res, next) {
  if (!req.user?._id) return res.status(401).json({ error: 'Authentication required.' });
  const key = String(req.user._id);
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS) {
    res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }
  return next();
}

export const requireUserRateLimit = userRateLimit;
