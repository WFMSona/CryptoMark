import { wsService } from './websocket';
import type { SignalingMessage } from '../types';

type StreamHandler = (stream: MediaStream) => void;
type AudioDataHandler = (data: ArrayBuffer) => void;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStreamHandler: StreamHandler | null = null;
  private audioDataHandler: AudioDataHandler | null = null;
  private audioContext: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private currentCallId: string | null = null;
  private remoteUserId: string | null = null;

  async initialize(): Promise<MediaStream> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      return this.localStream;
    } catch (err) {
      console.error('[WebRTC] Failed to get user media:', err);
      throw err;
    }
  }

  setRemoteStreamHandler(handler: StreamHandler): void {
    this.remoteStreamHandler = handler;
  }

  setAudioDataHandler(handler: AudioDataHandler): void {
    this.audioDataHandler = handler;
  }

  async createOffer(remoteUserId: string, callId: string): Promise<void> {
    this.currentCallId = callId;
    this.remoteUserId = remoteUserId;

    this.createPeerConnection();

    const offer = await this.peerConnection!.createOffer();
    await this.peerConnection!.setLocalDescription(offer);

    wsService.send({
      type: 'offer',
      payload: offer,
      from: '',
      to: remoteUserId,
      callId,
    });
  }

  async handleOffer(message: SignalingMessage): Promise<void> {
    this.currentCallId = message.callId || null;
    this.remoteUserId = message.from;

    this.createPeerConnection();

    const offer = message.payload as RTCSessionDescriptionInit;
    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    wsService.send({
      type: 'answer',
      payload: answer,
      from: '',
      to: message.from,
      callId: message.callId,
    });
  }

  async handleAnswer(message: SignalingMessage): Promise<void> {
    const answer = message.payload as RTCSessionDescriptionInit;
    await this.peerConnection?.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async handleIceCandidate(message: SignalingMessage): Promise<void> {
    const candidate = message.payload as RTCIceCandidateInit;
    await this.peerConnection?.addIceCandidate(new RTCIceCandidate(candidate));
  }

  private createPeerConnection(): void {
    this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
    }

    // Handle remote tracks
    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Remote track received');
      if (this.remoteStreamHandler && event.streams[0]) {
        this.remoteStreamHandler(event.streams[0]);
        this.setupRemoteAudioCapture(event.streams[0]);
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.remoteUserId) {
        wsService.send({
          type: 'ice-candidate',
          payload: event.candidate,
          from: '',
          to: this.remoteUserId,
          callId: this.currentCallId || undefined,
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', this.peerConnection?.connectionState);
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE Connection state:', this.peerConnection?.iceConnectionState);
    };

    this.peerConnection.onicegatheringstatechange = () => {
      console.log('[WebRTC] ICE Gathering state:', this.peerConnection?.iceGatheringState);
    };
  }

  private setupRemoteAudioCapture(stream: MediaStream): void {
    // Use MediaRecorder to capture remote audio for the detector
    this.audioContext = new AudioContext();

    // We'll use MediaRecorder for simpler audio capture
    try {
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && this.audioDataHandler) {
          const buffer = await event.data.arrayBuffer();
          this.audioDataHandler(buffer);
        }
      };
    } catch (err) {
      console.error('[WebRTC] MediaRecorder not supported:', err);
    }
  }

  startRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
      this.mediaRecorder.start(1000); // Capture every 1 second
      console.log('[WebRTC] Recording started');

      if (this.currentCallId) {
        wsService.send({
          type: 'recording-start',
          payload: {},
          from: '',
          to: this.remoteUserId || '',
          callId: this.currentCallId,
        });
      }
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      console.log('[WebRTC] Recording stopped');

      if (this.currentCallId) {
        wsService.send({
          type: 'recording-stop',
          payload: {},
          from: '',
          to: this.remoteUserId || '',
          callId: this.currentCallId,
        });
      }
    }
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  toggleMute(): boolean {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return !audioTrack.enabled; // Returns true if muted
      }
    }
    return false;
  }

  isMuted(): boolean {
    const audioTrack = this.localStream?.getAudioTracks()[0];
    return audioTrack ? !audioTrack.enabled : true;
  }

  endCall(): void {
    this.stopRecording();

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.mediaRecorder = null;
    this.currentCallId = null;
    this.remoteUserId = null;
  }

  cleanup(): void {
    this.endCall();

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }

  getCallId(): string | null {
    return this.currentCallId;
  }

  setCallId(callId: string): void {
    this.currentCallId = callId;
  }
}

export const webrtcService = new WebRTCService();
