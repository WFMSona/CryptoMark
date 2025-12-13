import { useCall } from '../context/CallContext';

import { PhoneIcon, PhoneOffIcon } from './Icons';
import styles from './IncomingCallModal.module.css';

export function IncomingCallModal() {
  const { incomingCall, acceptCall, rejectCall } = useCall();

  if (!incomingCall) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.pulseRing} />
        <div className={styles.pulseRing} style={{ animationDelay: '0.5s' }} />
        <div className={styles.pulseRing} style={{ animationDelay: '1s' }} />

        <div className={styles.avatar}>
          {incomingCall.caller.username.charAt(0).toUpperCase()}
        </div>

        <h2 className={styles.title}>Incoming Call</h2>
        <p className={styles.caller}>{incomingCall.caller.username}</p>

        <div className={styles.actions}>
          <button
            className={`${styles.actionBtn} ${styles.reject}`}
            onClick={rejectCall}
          >
            <PhoneOffIcon size={28} />
          </button>
          <button
            className={`${styles.actionBtn} ${styles.accept}`}
            onClick={acceptCall}
          >
            <PhoneIcon size={28} />
          </button>
        </div>
      </div>
    </div>
  );
}
