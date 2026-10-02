import React, { useState, useEffect } from 'react';
import { Navbar } from '../components/Navbar';
import { Modal } from '../components/Modal';
import styles from './SettingsPage.module.css';

interface SettingsPageProps {
  onLockVault: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onLockVault }) => {
  const [theme, setTheme] = useState<string>('system');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'system';
    setTheme(savedTheme);
  }, []);

  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTheme = e.target.value;
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    
    if (newTheme === 'dark' || (newTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  };

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [dbLocation, setDbLocation] = useState('');
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);
  const [newDbLocation, setNewDbLocation] = useState('');

  useEffect(() => {
    fetch('/api/db-location')
      .then(res => res.json())
      .then(data => {
        if (data.path) {
          setDbLocation(data.path);
        }
      })
      .catch(err => console.error("Failed to fetch DB location", err));
  }, []);

  const handleOpenPasswordModal = () => {
    setIsPasswordModalOpen(true);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to update password');
      }
      setSuccess('Master password updated successfully!');
      setTimeout(() => {
        setIsPasswordModalOpen(false);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDbModal = () => {
    setIsDbModalOpen(true);
    // Suggest the current directory as a starting point
    setNewDbLocation(dbLocation.replace(/\\keybox\.db$/, '').replace(/\/keybox\.db$/, ''));
    setError('');
    setSuccess('');
  };

  const handleUpdateDbLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newDbLocation) {
      setError('Please enter a directory path.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/db-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_path: newDbLocation }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to update database location');
      }
      setDbLocation(data.path);
      setSuccess('Database moved successfully!');
      setTimeout(() => {
        setIsDbModalOpen(false);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeftGroup}>
          <h1 className={styles.pageTitle}>Settings</h1>
        </div>
        <div className={styles.actionsGroup}>
          <div className={styles.windowControlsWrapper}>
            <Navbar isUnlocked={true} onLockVault={onLockVault} />
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <p className={styles.subtitle}>Manage your app preferences.</p>
        
        <div className={styles.settingsGroup}>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <h3 className={styles.settingTitle}>Auto-lock</h3>
              <p className={styles.settingDesc}>Lock after a period of inactivity.</p>
            </div>
            <div className={styles.settingControl}>
              <select className={styles.select}>
                <option>5 minutes</option>
                <option>15 minutes</option>
                <option>1 hour</option>
                <option>Never</option>
              </select>
            </div>
          </div>
          
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <h3 className={styles.settingTitle}>Master Password</h3>
              <p className={styles.settingDesc}>Change your vault's master password.</p>
            </div>
            <div className={styles.settingControl}>
              <button 
                className={styles.actionButton}
                onClick={handleOpenPasswordModal}
              >
                Update Password
              </button>
            </div>
          </div>

          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <h3 className={styles.settingTitle}>Database Location</h3>
              <p className={styles.settingDesc} style={{ wordBreak: 'break-all' }}>
                {dbLocation || "Loading..."}
              </p>
            </div>
            <div className={styles.settingControl}>
              <button 
                className={styles.actionButton}
                onClick={handleOpenDbModal}
              >
                Change Location
              </button>
            </div>
          </div>

          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <h3 className={styles.settingTitle}>Theme</h3>
              <p className={styles.settingDesc}>Choose your preferred appearance.</p>
            </div>
            <div className={styles.settingControl}>
              <select className={styles.select} value={theme} onChange={handleThemeChange}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title="Update Master Password"
      >
        <form onSubmit={handleUpdatePassword} className={styles.modalForm}>
          {error && <div className={styles.errorMessage}>{error}</div>}
          {success && <div className={styles.successMessage}>{success}</div>}
          
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Current Password</label>
            <input
              type="password"
              className={styles.input}
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Enter current password"
            />
          </div>
          
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>New Password</label>
            <input
              type="password"
              className={styles.input}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Confirm New Password</label>
            <input
              type="password"
              className={styles.input}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>

          <button 
            type="submit" 
            className={styles.saveButton}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Updating...' : 'Save Password'}
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={isDbModalOpen}
        onClose={() => setIsDbModalOpen(false)}
        title="Move Database"
      >
        <form onSubmit={handleUpdateDbLocation} className={styles.modalForm}>
          {error && <div className={styles.errorMessage}>{error}</div>}
          {success && <div className={styles.successMessage}>{success}</div>}
          
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>New Directory Path</label>
            <input
              type="text"
              className={styles.input}
              value={newDbLocation}
              onChange={(e) => setNewDbLocation(e.target.value)}
              placeholder="e.g. D:\SecureData\Keybox"
            />
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              The keybox.db file will be moved to this folder.
            </p>
          </div>

          <button 
            type="submit" 
            className={styles.saveButton}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Moving...' : 'Move Database'}
          </button>
        </form>
      </Modal>
    </>
  );
};
