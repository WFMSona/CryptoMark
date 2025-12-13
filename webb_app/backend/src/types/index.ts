export interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  autoRecord: boolean;
}

export interface UserPublic {
  id: string;
  username: string;
  online: boolean;
}

export interface AuthPayload {
  userId: string;
  username: string;
}

export interface CallSession {
  id: string;
  callerId: string;
  calleeId: string;
  status: 'pending' | 'active' | 'ended';
  startedAt: string;
  endedAt?: string;
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'call-request' | 'call-accept' | 'call-reject' | 'call-end' | 'recording-start' | 'recording-stop';
  payload: unknown;
  from: string;
  to: string;
  callId?: string;
}

export interface AudioChunk {
  callId: string;
  speakerId: string;
  timestamp: number;
  data: ArrayBuffer;
}

export interface DetectionResult {
  callId: string;
  speakerId: string;
  timestamp: number;
  isAuthentic: boolean;
  confidence: number;
}

export interface WebSocketClient {
  userId: string;
  username: string;
  socket: import('ws').WebSocket;
}
