import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import { api } from '../services/api';
import { wsService } from '../services/websocket';
import {
  Input,
  UserCard,
  IncomingCallModal,
  SearchIcon,
  LogOutIcon,
  SettingsIcon,
  WaveformIcon
} from '../components';
import type { User, Settings } from '../types';
import styles from './HomePage.module.css';

export function HomePage() {
  const { user, logout } = useAuth();
  const { status, initiateCall } = useCall();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>({ autoRecord: false });

  // Load settings
  useEffect(() => {
    api.getSettings().then(setSettings).catch(console.error);
  }, []);

  // Listen for online users
  useEffect(() => {
    const unsub = wsService.onOnlineUsers((users) => {
      setOnlineUsers(users);
    });
    return unsub;
  }, []);

  // Search users
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 1) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const { users } = await api.searchUsers(query);
      setSearchResults(users);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  const handleCall = async (targetUser: User) => {
    try {
      await initiateCall(targetUser);
    } catch (err) {
      console.error('Failed to initiate call:', err);
    }
  };

  const handleSettingsChange = async (autoRecord: boolean) => {
    setSettings({ autoRecord });
    await api.updateSettings({ autoRecord });
  };

  const displayUsers = searchQuery.length > 0 ? searchResults : onlineUsers;
  const isInCall = status !== 'idle' && status !== 'ended';

  return (
    <div className={styles.page}>
      <IncomingCallModal />

      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <WaveformIcon size={24} />
          </div>
          <span className={styles.brandName}>
            Voice<span className="text-gradient">Auth</span>
          </span>
        </div>

        <div className={styles.headerActions}>
          <button
            className={styles.iconBtn}
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            <SettingsIcon size={20} />
          </button>
          <div className={styles.userBadge}>
            <span className={styles.avatar}>
              {user?.username.charAt(0).toUpperCase()}
            </span>
            <span className={styles.username}>{user?.username}</span>
          </div>
          <button className={styles.iconBtn} onClick={logout} title="Logout">
            <LogOutIcon size={20} />
          </button>
        </div>
      </header>

      {showSettings && (
        <div className={styles.settingsPanel}>
          <h3>Settings</h3>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.autoRecord}
              onChange={(e) => handleSettingsChange(e.target.checked)}
            />
            <span className={styles.toggleSwitch} />
            <span>Auto-record all calls</span>
          </label>
        </div>
      )}

      <main className={styles.main}>
        <div className={styles.searchSection}>
          <h2>Find someone to call</h2>
          <Input
            placeholder="Search by username..."
            icon={<SearchIcon size={18} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={styles.usersSection}>
          {searchQuery.length > 0 ? (
            <h3>Search Results</h3>
          ) : (
            <h3>Online Now</h3>
          )}

          {searching ? (
            <div className={styles.loading}>Searching...</div>
          ) : displayUsers.length > 0 ? (
            <div className={styles.usersList}>
              {displayUsers.map((u) => (
                <UserCard
                  key={u.id}
                  user={u}
                  onCall={handleCall}
                  disabled={isInCall}
                />
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              {searchQuery.length > 0
                ? 'No users found'
                : 'No one else is online right now'}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
