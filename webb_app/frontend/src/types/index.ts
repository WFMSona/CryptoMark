export interface User {
  id: string;
  username: string;
  online: boolean;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface CallState {
  status: 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';
  callId: string | null;
  remoteUser: User | null;
  isRecording: boolean;
  isMuted: boolean;
}

export interface DetectionResult {
  callId: string;
  speakerId: string;
  timestamp: number;
  isAuthentic: boolean;
  confidence: number;
}

export interface SignalingMessage {
  type: string;
  payload: unknown;
  from: string;
  to: string;
  callId?: string;
}

export interface Settings {
  autoRecord: boolean;
}
