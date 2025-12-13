import { useMemo } from 'react';
import type { DetectionResult } from '../types';
import { ShieldCheckIcon, ShieldXIcon } from './Icons';
import styles from './DetectionIndicator.module.css';

interface DetectionIndicatorProps {
  results: DetectionResult[];
  isRecording: boolean;
}

export function DetectionIndicator({ results, isRecording }: DetectionIndicatorProps) {
  const latestResult = results[results.length - 1];
  
  const stats = useMemo(() => {
    if (results.length === 0) return { authentic: 0, suspicious: 0, rate: 0 };
    
    const authentic = results.filter(r => r.isAuthentic).length;
    const suspicious = results.length - authentic;
    const rate = Math.round((authentic / results.length) * 100);
    
    return { authentic, suspicious, rate };
  }, [results]);

  if (!isRecording) {
    return (
      <div className={styles.container}>
        <div className={styles.inactive}>
          <div className={styles.iconWrapper}>
            <ShieldCheckIcon size={32} />
          </div>
          <p>Enable recording to start voice verification</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>Voice Authentication</h3>
        <span className={styles.live}>
          <span className={styles.liveDot} />
          LIVE
        </span>
      </div>

      <div className={styles.mainIndicator}>
        <div className={`${styles.statusIcon} ${latestResult?.isAuthentic ? styles.authentic : styles.suspicious}`}>
          {latestResult?.isAuthentic ? (
            <ShieldCheckIcon size={48} />
          ) : (
            <ShieldXIcon size={48} />
          )}
        </div>
        <div className={styles.statusText}>
          <span className={styles.statusLabel}>
            {latestResult?.isAuthentic ? 'VERIFIED' : 'SUSPICIOUS'}
          </span>
          <span className={styles.confidence}>
            {latestResult ? `${Math.round(latestResult.confidence * 100)}% confidence` : 'Analyzing...'}
          </span>
        </div>
      </div>

      <div className={styles.timeline}>
        {results.slice(-20).map((result, i) => (
          <div
            key={i}
            className={`${styles.timelineDot} ${result.isAuthentic ? styles.dotAuthentic : styles.dotSuspicious}`}
            title={`${result.isAuthentic ? 'Authentic' : 'Suspicious'} - ${Math.round(result.confidence * 100)}%`}
          />
        ))}
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue} style={{ color: 'var(--success)' }}>{stats.authentic}</span>
          <span className={styles.statLabel}>Verified</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue} style={{ color: 'var(--danger)' }}>{stats.suspicious}</span>
          <span className={styles.statLabel}>Suspicious</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{stats.rate}%</span>
          <span className={styles.statLabel}>Auth Rate</span>
        </div>
      </div>
    </div>
  );
}
