import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { userQueries } from './database.js';
import type { User, AuthPayload, UserPublic } from '../types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SALT_ROUNDS = 10;

export async function registerUser(username: string, password: string): Promise<{ user: UserPublic; token: string }> {
  // Check if username exists
  const existing = userQueries.findByUsername.get(username) as User | undefined;
  if (existing) {
    throw new Error('Username already taken');
  }

  // Hash password and create user
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const id = uuidv4();
  const createdAt = new Date().toISOString();

  userQueries.create.run(id, username, passwordHash, createdAt, 0);

  const token = generateToken({ userId: id, username });

  return {
    user: { id, username, online: true },
    token,
  };
}

export async function loginUser(username: string, password: string): Promise<{ user: UserPublic; token: string }> {
  const user = userQueries.findByUsername.get(username) as User | undefined;
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  const token = generateToken({ userId: user.id, username: user.username });

  return {
    user: { id: user.id, username: user.username, online: true },
    token,
  };
}

export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, JWT_SECRET) as AuthPayload;
}

export function searchUsers(query: string, excludeUserId: string): UserPublic[] {
  const results = userQueries.searchByUsername.all(`%${query}%`, excludeUserId) as { id: string; username: string }[];
  return results.map(u => ({ ...u, online: false })); // Online status updated by WebSocket manager
}

export function getUserById(id: string): User | undefined {
  return userQueries.findById.get(id) as User | undefined;
}

export function setAutoRecord(userId: string, enabled: boolean): void {
  userQueries.updateAutoRecord.run(enabled ? 1 : 0, userId);
}

export function getAutoRecord(userId: string): boolean {
  const result = userQueries.getAutoRecord.get(userId) as { autoRecord: number } | undefined;
  return result?.autoRecord === 1;
}
