import type { User } from '../types';
import { Button } from './Button';
import { PhoneIcon } from './Icons';
import styles from './UserCard.module.css';

interface UserCardProps {
  user: User;
  onCall: (user: User) => void;
  disabled?: boolean;
}

export function UserCard({ user, onCall, disabled }: UserCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.avatar}>
        {user.username.charAt(0).toUpperCase()}
      </div>
      <div className={styles.info}>
        <span className={styles.username}>{user.username}</span>
        <span className={`${styles.status} ${user.online ? styles.online : ''}`}>
          <span className={styles.dot} />
          {user.online ? 'Online' : 'Offline'}
        </span>
      </div>
      <div className={styles.actions}>
        <Button
          variant="primary"
          size="sm"
          icon={<PhoneIcon size={16} />}
          onClick={() => onCall(user)}
          disabled={disabled || !user.online}
        >
          Call
        </Button>
      </div>
    </div>
  );
}
