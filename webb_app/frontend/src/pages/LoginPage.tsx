import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Input, UserIcon, LockIcon, WaveformIcon } from '../components';
import styles from './Auth.module.css';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
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
          <h2 className={styles.formTitle}>Welcome back</h2>
          
          {error && <div className={styles.error}>{error}</div>}

          <Input
            label="Username"
            placeholder="Enter your username"
            icon={<UserIcon size={18} />}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />

          <Input
            label="Password"
            type="password"
            placeholder="Enter your password"
            icon={<LockIcon size={18} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <Button type="submit" fullWidth loading={loading}>
            Sign In
          </Button>

          <p className={styles.switchPrompt}>
            Don't have an account? <Link to="/register">Create one</Link>
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
