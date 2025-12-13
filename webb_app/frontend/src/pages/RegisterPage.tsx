import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Input, UserIcon, LockIcon, WaveformIcon } from '../components';
import styles from './Auth.module.css';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await register(username, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <WaveformIcon size={32} />
          </div>
          <h1 className={styles.title}>
            Voice<span className="text-gradient">Auth</span>
          </h1>
          <p className={styles.tagline}>Secure Audio Calls with Real-time Voice Verification</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <h2 className={styles.formTitle}>Create Account</h2>
          
          {error && <div className={styles.error}>{error}</div>}

          <Input
            label="Username"
            placeholder="Choose a username"
            icon={<UserIcon size={18} />}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={20}
            autoComplete="username"
          />

          <Input
            label="Password"
            type="password"
            placeholder="Create a password"
            icon={<LockIcon size={18} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />

          <Input
            label="Confirm Password"
            type="password"
            placeholder="Confirm your password"
            icon={<LockIcon size={18} />}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />

          <Button type="submit" fullWidth loading={loading}>
            Create Account
          </Button>

          <p className={styles.switchPrompt}>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </div>

      <div className={styles.decoration}>
        <div className={styles.grid} />
        <div className={styles.glow} />
      </div>
    </div>
  );
}
