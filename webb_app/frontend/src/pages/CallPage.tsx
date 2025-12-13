import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCall } from '../context/CallContext';
import {
  DetectionIndicator,
  PhoneOffIcon,
  MicIcon,
  MicOffIcon,
  RecordIcon,
  StopIcon,
  WaveformIcon
} from '../components';
import styles from './CallPage.module.css';

export function CallPage() {
  const navigate = useNavigate();
  const {
    status,
    remoteUser,
    isRecording,
    isMuted,
    endCall,
    toggleRecording,
    toggleMute,
    detectionResults,
    remoteStream,
  } = useCall();

  const audioRef = useRef<HTMLAudioElement>(null);
  const callDurationRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Play remote audio
  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Call duration timer
  useEffect(() => {
    if (status === 'connected') {
      timerRef.current = setInterval(() => {
        callDurationRef.current += 1;
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [status]);

  // Redirect if no active call
  useEffect(() => {
    if (status === 'idle') {
      navigate('/');
    }
  }, [status, navigate]);


  const handleEndCall = () => {
    endCall();
    navigate('/');
  };

  if (!remoteUser) {
    return null;
  }

  return (
    <div className={styles.page}>
      <audio ref={audioRef} autoPlay />

      <div className={styles.background}>
        <div className={styles.wave1} />
        <div className={styles.wave2} />
        <div className={styles.wave3} />
      </div>

      <header className={styles.header}>
        <div className={styles.brand}>
          <WaveformIcon size={20} />
          <span>VoiceAuth</span>
        </div>
        {isRecording && (
          <div className={styles.recordingBadge}>
            <span className={styles.recordingDot} />
            Recording
          </div>
        )}
      </header>

      <main className={styles.main}>
        <div className={styles.callInfo}>
          <div className={`${styles.avatar} ${status === 'connected' ? styles.connected : ''}`}>
            {remoteUser.username.charAt(0).toUpperCase()}
            {status === 'calling' && (
              <>
                <div className={styles.ring1} />
                <div className={styles.ring2} />
              </>
            )}
          </div>

          <h1 className={styles.username}>{remoteUser.username}</h1>

          <p className={styles.status}>
            {status === 'calling' && 'Calling...'}
            {status === 'connected' && 'Connected'}
            {status === 'ended' && 'Call ended'}
          </p>
        </div>

        {status === 'connected' && (
          <div className={styles.detection}>
            <DetectionIndicator results={detectionResults} isRecording={isRecording} />
          </div>
        )}
      </main>

      <footer className={styles.controls}>
        <button
          className={`${styles.controlBtn} ${isMuted ? styles.active : ''}`}
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOffIcon size={24} /> : <MicIcon size={24} />}
        </button>

        {status === 'connected' && (
          <button
            className={`${styles.controlBtn} ${styles.recordBtn} ${isRecording ? styles.recording : ''}`}
            onClick={toggleRecording}
            title={isRecording ? 'Stop Recording' : 'Start Recording'}
          >
            {isRecording ? <StopIcon size={24} /> : <RecordIcon size={24} />}
          </button>
        )}

        <button
          className={`${styles.controlBtn} ${styles.endBtn}`}
          onClick={handleEndCall}
          title="End Call"
        >
          <PhoneOffIcon size={24} />
        </button>
      </footer>
    </div>
  );
}
