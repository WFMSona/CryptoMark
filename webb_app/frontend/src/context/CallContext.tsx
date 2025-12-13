import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { wsService } from '../services/websocket';
import { webrtcService } from '../services/webrtc';
import { useAuth } from './AuthContext';
import type { User, CallState, DetectionResult, SignalingMessage } from '../types';

interface CallContextType extends CallState {
  initiateCall: (user: User) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleRecording: () => void;
  toggleMute: () => void;
  toggleAiMode: () => Promise<void>;
  callMode: 'human' | 'ai';
  incomingCall: { callId: string; caller: User } | null;
  detectionResults: DetectionResult[];
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isRecordingInitiator: boolean;
}

const CallContext = createContext<CallContextType | null>(null);

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<CallState>({
    status: 'idle',
    callId: null,
    remoteUser: null,
    isRecording: false,
    isMuted: false,
  });
  const [incomingCall, setIncomingCall] = useState<{ callId: string; caller: User } | null>(null);
  const [detectionResults, setDetectionResults] = useState<DetectionResult[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const [callMode, setCallMode] = useState<'human' | 'ai'>('human');
  const [isRecordingInitiator, setIsRecordingInitiator] = useState<boolean>(false);

  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  const stopRingtone = useCallback(() => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
  }, []);

  // Initialize ringtone
  useEffect(() => {
    ringtoneRef.current = new Audio('/sounds/ringtone.mp3');
    ringtoneRef.current.loop = true;
  }, []);

  // Handle ringtone playback
  useEffect(() => {
    if (incomingCall) {
      ringtoneRef.current?.play().catch(err => {
        console.warn('[Call] Failed to play ringtone:', err);
      });
    } else {
      stopRingtone();
    }
  }, [incomingCall, stopRingtone]);

  // Handle WebSocket messages
  useEffect(() => {
    const unsubMessage = wsService.onMessage(async (message: SignalingMessage) => {
      console.log('[Call] Received message:', message.type);

      switch (message.type) {
        case 'call-request': {
          const payload = message.payload as { callerName: string };
          setIncomingCall({
            callId: message.callId!,
            caller: {
              id: message.from,
              username: payload.callerName,
              online: true,
            },
          });
          break;
        }

        case 'call-accept':
          stopRingtone(); // Ensure ringtone stops
          setState(s => ({ ...s, status: 'connected' }));
          if (state.callId && state.remoteUser) {
            await webrtcService.createOffer(state.remoteUser.id, state.callId);
          }
          break;

        case 'call-reject': {
          stopRingtone(); // Ensure ringtone stops
          const payload = message.payload as { reason?: string };
          console.log('[Call] Call rejected:', payload.reason);
          setState(s => ({ ...s, status: 'ended' }));
          setTimeout(() => {
            setState(s => ({ ...s, status: 'idle', callId: null, remoteUser: null }));
          }, 2000);
          break;
        }

        case 'call-end':
          stopRingtone(); // Ensure ringtone stops
          webrtcService.endCall();
          setRemoteStream(null);
          setDetectionResults([]);
          setState(s => ({ ...s, status: 'ended', isRecording: false }));
          setTimeout(() => {
            setState(s => ({ ...s, status: 'idle', callId: null, remoteUser: null }));
          }, 2000);
          break;

        case 'offer':
          await webrtcService.handleOffer(message);
          break;

        case 'answer':
          await webrtcService.handleAnswer(message);
          break;

        case 'ice-candidate':
          await webrtcService.handleIceCandidate(message);
          break;

        case 'recording-start':
          setState(s => ({ ...s, isRecording: true }));
          break;

        case 'recording-stop':
          setState(s => ({ ...s, isRecording: false }));
          setIsRecordingInitiator(false);
          break;
      }
    });

    const unsubDetection = wsService.onDetection((result: DetectionResult) => {
      setDetectionResults(prev => [...prev.slice(-30), result]); // Keep last 30 results
    });

    return () => {
      unsubMessage();
      unsubDetection();
    };
  }, [state.callId, state.remoteUser, stopRingtone]);

  // Setup remote stream handler
  useEffect(() => {
    webrtcService.setRemoteStreamHandler((stream) => {
      setRemoteStream(stream);
    });

    webrtcService.setAudioDataHandler((data) => {
      wsService.sendAudioData(data);
    });
  }, []);

  const initiateCall = useCallback(async (targetUser: User) => {
    try {
      console.log('[Call] Initiating call to:', targetUser.username, targetUser.id);
      setCallMode('human'); // Reset to human mode

      const stream = await webrtcService.initialize('human');
      setLocalStream(stream);

      const callId = `call_${Date.now()}`;
      console.log('[Call] Created callId:', callId);

      setState({
        status: 'calling',
        callId,
        remoteUser: targetUser,
        isRecording: false,
        isMuted: false,
      });
      setIsRecordingInitiator(false); // Reset initiator state

      console.log('[Call] Sending call-request via WebSocket');
      wsService.send({
        type: 'call-request',
        payload: {},
        from: user!.id,
        to: targetUser.id,
        callId,
      });
      console.log('[Call] Call request sent');

    } catch (err) {
      console.error('[Call] Failed to initiate call:', err);
      throw err;
    }
  }, [user]);

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    stopRingtone(); // Stop ringtone immediately
    setCallMode('human'); // Reset to human mode

    try {
      const stream = await webrtcService.initialize('human');
      setLocalStream(stream);
      webrtcService.setCallId(incomingCall.callId);

      setState({
        status: 'connected',
        callId: incomingCall.callId,
        remoteUser: incomingCall.caller,
        isRecording: false,
        isMuted: false,
      });

      wsService.send({
        type: 'call-accept',
        payload: {},
        from: user!.id,
        to: incomingCall.caller.id,
        callId: incomingCall.callId,
      });

      setIncomingCall(null);
    } catch (err) {
      console.error('[Call] Failed to accept call:', err);
      throw err;
    }
  }, [incomingCall, user, stopRingtone]);

  const rejectCall = useCallback(() => {
    if (!incomingCall) return;
    stopRingtone(); // Stop ringtone immediately

    wsService.send({
      type: 'call-reject',
      payload: { reason: 'User declined' },
      from: user!.id,
      to: incomingCall.caller.id,
      callId: incomingCall.callId,
    });

    setIncomingCall(null);
  }, [incomingCall, user, stopRingtone]);

  const endCall = useCallback(() => {
    stopRingtone();
    if (state.remoteUser && state.callId) {
      wsService.send({
        type: 'call-end',
        payload: {},
        from: user!.id,
        to: state.remoteUser.id,
        callId: state.callId,
      });
    }

    webrtcService.endCall();
    setRemoteStream(null);
    setDetectionResults([]);
    setState(s => ({ ...s, status: 'ended', isRecording: false }));
    setTimeout(() => {
      setState(s => ({ ...s, status: 'idle', callId: null, remoteUser: null }));
    }, 2000);
  }, [state.remoteUser, state.callId, user, stopRingtone]);

  const toggleRecording = useCallback(() => {
    if (webrtcService.isRecording()) {
      webrtcService.stopRecording();
      // isRecordingInitiator remains true until confirmation or stop
    } else {
      webrtcService.startRecording();
      setIsRecordingInitiator(true); // User clicked local button
    }
  }, []);

  const toggleMute = useCallback(() => {
    const muted = webrtcService.toggleMute();
    setState(s => ({ ...s, isMuted: muted }));
  }, []);

  const toggleAiMode = useCallback(async () => {
    const newMode = callMode === 'human' ? 'ai' : 'human';
    try {
      await webrtcService.switchInputSource(newMode);
      setCallMode(newMode);
      console.log(`[Call] Switched to ${newMode} mode`);
    } catch (err) {
      console.error('[Call] Failed to toggle AI mode:', err);
    }
  }, [callMode]);

  return (
    <CallContext.Provider
      value={{
        ...state,
        initiateCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleRecording,
        toggleMute,
        toggleAiMode,
        callMode,
        incomingCall,
        detectionResults,
        localStream,
        remoteStream,
        isRecordingInitiator,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall(): CallContextType {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within CallProvider');
  }
  return context;
}
