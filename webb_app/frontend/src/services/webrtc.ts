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
  private currentCallId: string | null = null;
  private remoteUserId: string | null = null;

  async initialize(mode: 'human' | 'ai' = 'human'): Promise<MediaStream> {
    try {
      this.localStream?.getTracks().forEach(track => track.stop());

      if (mode === 'ai') {
        // Create audio context
        const ctx = new AudioContext(); // Default rate
        this.audioContext = ctx; // Store reference to close later

        // Create destination (stream)
        const dest = ctx.createMediaStreamDestination();

        // Load audio file
        const response = await fetch('/sounds/masa_1.wav');
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        // Create source and loop it
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = true;

        // Connect source to destination
        source.connect(dest);
        source.start(0);

        this.localStream = dest.stream;
      } else {
        // Human mode - use microphone
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,

            // @ts-ignore - Chrome specific constraints
            googEchoCancellation: false,
            googAutoGainControl: false,
            googNoiseSuppression: false,
            googHighpassFilter: false,
            googTypingNoiseDetection: false,

            channelCount: 2,
            sampleRate: 44100,
            sampleSize: 16
          },
          video: false,
        });
      }

      return this.localStream;
    } catch (err) {
      console.error('[WebRTC] Failed to initialize stream:', err);
      throw err;
    }
  }

  async switchInputSource(mode: 'human' | 'ai'): Promise<void> {
    if (!this.peerConnection) return;

    try {
      // 1. Get new stream
      const newStream = await this.initialize(mode);
      const newTrack = newStream.getAudioTracks()[0];

      // 2. Replace track in PeerConnection
      const senders = this.peerConnection.getSenders();
      const audioSender = senders.find(s => s.track?.kind === 'audio');

      if (audioSender) {
        await audioSender.replaceTrack(newTrack);
        console.log(`[WebRTC] Switched input source to ${mode}`);
      }

      this.localStream = newStream;
    } catch (err) {
      console.error('[WebRTC] Failed to switch input source:', err);
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
    // Optimize Opus for Max Quality
    const sdp = this.optimizeOpus(offer.sdp);
    const modifiedOffer = { type: offer.type, sdp };

    await this.peerConnection!.setLocalDescription(modifiedOffer);

    wsService.send({
      type: 'offer',
      payload: modifiedOffer,
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
    // Optimize Opus in answer too
    const sdp = this.optimizeOpus(answer.sdp);
    const modifiedAnswer = { type: answer.type, sdp };

    await this.peerConnection!.setLocalDescription(modifiedAnswer);

    wsService.send({
      type: 'answer',
      payload: modifiedAnswer,
      from: '',
      to: message.from,
      callId: message.callId,
    });
  }

  // Helper to Maximize Opus Quality
  private optimizeOpus(sdp: string | undefined): string {
    if (!sdp) return '';

    const lines = sdp.split('\r\n');
    let opusPayloadType = '';

    // 1. Find Opus Payload Type
    for (const line of lines) {
      if (line.includes('a=rtpmap') && line.toLowerCase().includes('opus')) {
        const parts = line.split(':');
        if (parts[1]) {
          opusPayloadType = parts[1].split(' ')[0];
          break;
        }
      }
    }

    if (!opusPayloadType) return sdp;

    // 2. Modify fmtp line to increase bitrate
    // Check if fmtp line exists
    const hasFmtp = lines.some(l => l.includes(`a=fmtp:${opusPayloadType}`));

    if (!hasFmtp) {
      // Add new fmtp line
      // maxaveragebitrate=510000 (Max Opus)
      // stereo=1 (Force stereo)
      // useinbandfec=1 (Forward Error Correction)
      // cbr=1 (Constant Bit Rate - better for watermark consistency)
      // prop-stereo=1 (Pre-processing stereo)
      const fmtpLine = `a=fmtp:${opusPayloadType} maxaveragebitrate=510000;stereo=1;sprop-stereo=1;cbr=1;useinbandfec=1`;

      // Insert after rtpmap
      const rtpmapIndex = lines.findIndex(l => l.includes(`a=rtpmap:${opusPayloadType}`));
      if (rtpmapIndex !== -1) {
        lines.splice(rtpmapIndex + 1, 0, fmtpLine);
      }
    } else {
      // Update existing fmtp
      return lines.map(line => {
        if (line.includes(`a=fmtp:${opusPayloadType}`)) {
          // Merge our settings
          // Simple replace for now as likely only min ptime is there
          return `a=fmtp:${opusPayloadType} maxaveragebitrate=510000;stereo=1;sprop-stereo=1;cbr=1;useinbandfec=1`;
        }
        return line;
      }).join('\r\n');
    }

    return lines.join('\r\n');
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

  private sourceBuffer: Float32Array[] = [];
  private sourceBufferLength = 0;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private readonly CHUNK_DURATION_MS = 6000; // 6 seconds

  private setupRemoteAudioCapture(stream: MediaStream): void {
    const ctx = new AudioContext(); // Revert to default
    this.audioContext = ctx;
    const sourceRate = this.audioContext.sampleRate;
    console.log(`[WebRTC] Setting up remote audio capture (Native ${sourceRate}Hz)`);

    // 1. Create Source
    this.audioSource = this.audioContext.createMediaStreamSource(stream);

    // 2. Create Script Processor
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

    // 3. Processing Loop
    this.scriptProcessor.onaudioprocess = (event) => {
      if (!this.isRecording()) return;

      const inputData = event.inputBuffer.getChannelData(0); // Float32
      const dataCopy = new Float32Array(inputData);

      this.sourceBuffer.push(dataCopy);
      this.sourceBufferLength += dataCopy.length;

      // Calculate chunk size dynamically based on native rate
      const samplesPerChunk = Math.floor(sourceRate * (this.CHUNK_DURATION_MS / 1000));

      if (this.sourceBufferLength >= samplesPerChunk) {
        this.flushSourceBuffer();
      }
    };

    // 4. Connect graph
    this.audioSource.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);

    console.log('[WebRTC] Native Recorder initialized');
  }

  // Merge buffered arrays into one buffer and send
  private flushSourceBuffer(): void {
    if (this.sourceBufferLength === 0) return;

    // Flatten
    const fullBuffer = new Float32Array(this.sourceBufferLength);
    let offset = 0;
    for (const buf of this.sourceBuffer) {
      fullBuffer.set(buf, offset);
      offset += buf.length;
    }

    // Send raw bytes
    console.log(`[WebRTC] Sending raw Native chunk: ${fullBuffer.byteLength} bytes`);
    if (this.audioDataHandler) {
      this.audioDataHandler(fullBuffer.buffer);
    }

    // Reset
    this.sourceBuffer = [];
    this.sourceBufferLength = 0;
  }

  // State mgmt
  private _isRecording = false;

  startRecording(): void {
    const rate = this.audioContext?.sampleRate || 48000;
    console.log(`[WebRTC] startRecording (Native ${rate}Hz)`);
    this._isRecording = true;
    this.sourceBuffer = [];
    this.sourceBufferLength = 0;

    if (this.currentCallId) {
      wsService.send({
        type: 'recording-start',
        payload: { sampleRate: rate },
        from: '',
        to: this.remoteUserId || '',
        callId: this.currentCallId,
      });
    }
  }

  stopRecording(): void {
    if (this._isRecording) {
      console.log('[WebRTC] Stopping recording, flushing remaining...');
      this._isRecording = false;
      // We could flush here, but async rendering might be tricky at stop.
      // For now, we just stop accepting new data. The last chunk might be dropped 
      // if it's < 6 seconds, which is standard behavior for fixed chunks.

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
    return this._isRecording;
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

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor = null;
    }

    if (this.audioSource) {
      this.audioSource.disconnect();
      this.audioSource = null;
    }

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
