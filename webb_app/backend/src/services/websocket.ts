import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { verifyToken } from './auth.js';
import { voiceDetector } from './detector.js';
import { recordingService } from './recording.js';
import type { SignalingMessage, WebSocketClient, DetectionResult } from '../types/index.js';

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocketClient> = new Map();
  private activeCalls: Map<string, { callerId: string; calleeId: string; recording: boolean }> = new Map();

  initialize(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (socket, request) => {
      console.log('[WS] New connection attempt');

      // Extract token from query string
      const url = new URL(request.url || '', 'http://localhost');
      const token = url.searchParams.get('token');

      if (!token) {
        socket.close(4001, 'No token provided');
        return;
      }

      try {
        const payload = verifyToken(token);
        const client: WebSocketClient = {
          userId: payload.userId,
          username: payload.username,
          socket,
        };

        this.clients.set(payload.userId, client);
        console.log(`[WS] Client connected: ${payload.username} (${payload.userId})`);

        // Broadcast online status
        this.broadcastOnlineUsers();

        console.log(`[WS] Attaching message listener for: ${payload.username}`);
        socket.on('message', (data, isBinary) => {
          console.log(`[WS] Raw 'message' event received from ${payload.username}. isBinary: ${isBinary}`);
          this.handleMessage(client, data, isBinary);
        });

        socket.on('close', (code, reason) => {
          this.clients.delete(payload.userId);
          console.log(`[WS] Client disconnected: ${payload.username} Code: ${code} Reason: ${reason}`);
          this.broadcastOnlineUsers();
        });

        socket.on('error', (err) => {
          console.error(`[WS] Socket error for ${payload.username}:`, err);
        });

      } catch (err) {
        console.error('[WS] Token verification failed:', err);
        socket.close(4002, 'Invalid token');
      }
    });

    // Listen for detection results
    voiceDetector.on('result', (result: DetectionResult) => {
      this.sendDetectionResult(result);
    });

    console.log('[WS] WebSocket server initialized');
  }

  private handleMessage(client: WebSocketClient, rawData: unknown, isBinary: boolean): void {
    try {
      console.log(`[WS] Handling message type: ${typeof rawData}, isBinary: ${isBinary}`);

      // Handle binary audio data
      if (isBinary) {
        this.handleAudioData(client, rawData as Buffer);
        return;
      }

      const message = JSON.parse(rawData.toString()) as SignalingMessage;
      console.log(`[WS] Message from ${client.username}: ${message.type}`);

      switch (message.type) {
        case 'call-request':
          this.handleCallRequest(client, message);
          break;
        case 'call-accept':
          this.handleCallAccept(client, message);
          break;
        case 'call-reject':
          this.handleCallReject(client, message);
          break;
        case 'call-end':
          this.handleCallEnd(client, message);
          break;
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          this.forwardSignaling(client, message);
          break;
        case 'recording-start':
          this.handleRecordingStart(client, message);
          break;
        case 'recording-stop':
          this.handleRecordingStop(client, message);
          break;
        default:
          console.warn(`[WS] Unknown message type: ${(message as SignalingMessage).type}`);
      }
    } catch (err) {
      console.error('[WS] Error handling message:', err);
    }
  }

  private handleAudioData(client: WebSocketClient, audioData: Buffer): void {
    // Find active call for this client
    for (const [callId, call] of this.activeCalls) {
      if (call.recording && (call.callerId === client.userId || call.calleeId === client.userId)) {
        // Write to recording
        recordingService.writeChunk(callId, audioData);

        // Send to detector
        const remoteSpeakerId = call.callerId === client.userId ? call.calleeId : call.callerId;
        voiceDetector.processAudioChunk(callId, remoteSpeakerId, audioData);
        break;
      }
    }
  }

  private handleCallRequest(client: WebSocketClient, message: SignalingMessage): void {
    console.log('[WS] handleCallRequest - looking for user:', message.to);
    console.log('[WS] Available clients in Map:', Array.from(this.clients.keys()));

    const targetClient = this.clients.get(message.to);

    if (!targetClient) {
      console.warn(`[WS] Target user ${message.to} NOT FOUND in clients map`);
      this.sendToClient(client.userId, {
        type: 'call-reject',
        payload: { reason: 'User is offline' },
        from: 'system',
        to: client.userId,
      });
      return;
    }

    if (targetClient.socket.readyState !== WebSocket.OPEN) {
      console.warn(`[WS] Target user ${message.to} socket NOT OPEN (state: ${targetClient.socket.readyState})`);
      this.clients.delete(message.to); // Cleanup invalid client
      this.broadcastOnlineUsers();
      this.sendToClient(client.userId, {
        type: 'call-reject',
        payload: { reason: 'User appears offline' },
        from: 'system',
        to: client.userId,
      });
      return;
    }

    console.log(`[WS] Forwarding call request from ${client.username} to ${targetClient.username}`);

    // Create call session
    const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.activeCalls.set(callId, {
      callerId: client.userId,
      calleeId: message.to,
      recording: false,
    });

    // Forward to callee
    this.sendToClient(message.to, {
      ...message,
      from: client.userId,
      callId,
      payload: {
        ...(message.payload as object),
        callerName: client.username,
      },
    });
  }

  private handleCallAccept(client: WebSocketClient, message: SignalingMessage): void {
    this.sendToClient(message.to, {
      ...message,
      from: client.userId,
    });
  }

  private handleCallReject(client: WebSocketClient, message: SignalingMessage): void {
    const callId = message.callId;
    if (callId) {
      this.activeCalls.delete(callId);
    }
    this.sendToClient(message.to, {
      ...message,
      from: client.userId,
    });
  }

  private handleCallEnd(client: WebSocketClient, message: SignalingMessage): void {
    const callId = message.callId;
    if (callId) {
      const call = this.activeCalls.get(callId);
      if (call?.recording) {
        recordingService.stopRecording(callId);
        voiceDetector.stopProcessing(callId);
      }
      this.activeCalls.delete(callId);
    }
    this.sendToClient(message.to, {
      ...message,
      from: client.userId,
    });
  }

  private handleRecordingStart(client: WebSocketClient, message: SignalingMessage): void {
    const callId = message.callId;
    if (!callId) return;

    const call = this.activeCalls.get(callId);
    if (!call) return;

    call.recording = true;
    const remoteSpeakerId = call.callerId === client.userId ? call.calleeId : call.callerId;

    recordingService.startRecording(callId, remoteSpeakerId);
    voiceDetector.startProcessing(callId, remoteSpeakerId);

    // Notify both parties
    this.sendToClient(call.callerId, {
      type: 'recording-start',
      payload: { callId },
      from: 'system',
      to: call.callerId,
      callId,
    });
    this.sendToClient(call.calleeId, {
      type: 'recording-start',
      payload: { callId },
      from: 'system',
      to: call.calleeId,
      callId,
    });
  }

  private handleRecordingStop(client: WebSocketClient, message: SignalingMessage): void {
    const callId = message.callId;
    if (!callId) return;

    const call = this.activeCalls.get(callId);
    if (!call) return;

    call.recording = false;
    recordingService.stopRecording(callId);
    voiceDetector.stopProcessing(callId);

    // Notify both parties
    this.sendToClient(call.callerId, {
      type: 'recording-stop',
      payload: { callId },
      from: 'system',
      to: call.callerId,
      callId,
    });
    this.sendToClient(call.calleeId, {
      type: 'recording-stop',
      payload: { callId },
      from: 'system',
      to: call.calleeId,
      callId,
    });
  }

  private forwardSignaling(client: WebSocketClient, message: SignalingMessage): void {
    this.sendToClient(message.to, {
      ...message,
      from: client.userId,
    });
  }

  private sendDetectionResult(result: DetectionResult): void {
    const call = this.activeCalls.get(result.callId);
    if (!call) return;

    // Send result to the user who initiated recording (opposite of speaker being analyzed)
    const recipientId = result.speakerId === call.callerId ? call.calleeId : call.callerId;

    this.sendToClient(recipientId, {
      type: 'detection-result' as 'offer', // Type assertion for custom message
      payload: result,
      from: 'system',
      to: recipientId,
      callId: result.callId,
    });
  }

  private sendToClient(userId: string, message: SignalingMessage): void {
    const client = this.clients.get(userId);
    if (client && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(message));
    }
  }

  private broadcastOnlineUsers(): void {
    const onlineUsers = Array.from(this.clients.values()).map(c => ({
      id: c.userId,
      username: c.username,
      online: true,
    }));

    for (const client of this.clients.values()) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(JSON.stringify({
          type: 'online-users',
          payload: onlineUsers.filter(u => u.id !== client.userId),
          from: 'system',
          to: client.userId,
        }));
      }
    }
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.clients.keys());
  }

  isUserOnline(userId: string): boolean {
    return this.clients.has(userId);
  }
}

export const wsManager = new WebSocketManager();
