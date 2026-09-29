import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Plus, Star, User, Settings,
  Edit2, X as CloseIcon, Image as ImageIcon, Eye, EyeOff, Camera, Check, Trash2
} from 'lucide-react';
import styles from './VaultDashboard.module.css';
import { Navbar } from '../components/Navbar';

// ── Types ───────────────────────────────────────────────────

interface VaultEntry {
  id: number;
  website: string;
  username: string;
  password?: string;
  profile: string;
  color?: string;
  icon?: string | null;
  created_at: string;
  updated_at: string;
}

interface Profile {
  name: string;
  domain: string;
  color: string;
  icon: string | null;
  accounts: VaultEntry[];
  displayName: string;
  displayIcon: string | null;
}

interface ProfileMetadata {
  customName?: string;
  customImage?: string;
}

interface InlineProfileEdit {
  isNew?: boolean;
  originalName: string;
  name: string;
  icon: string | null;
}

interface VaultDashboardProps {
  onLockVault: () => void;
}

// ── API helpers ─────────────────────────────────────────────

async function fetchEntries(): Promise<VaultEntry[]> {
  const res = await fetch('/api/entries');
  if (res.status === 401) throw new Error('VAULT_LOCKED');
  if (!res.ok) throw new Error('Failed to fetch entries');
  return res.json();
}

async function fetchEntryDetails(entryId: number): Promise<VaultEntry> {
  const res = await fetch(`/api/entries/${entryId}`);
  if (!res.ok) throw new Error('Failed to fetch entry');
  return res.json();
}

// ── Component ───────────────────────────────────────────────

export const VaultDashboard: React.FC<VaultDashboardProps> = ({ onLockVault }) => {
  const [inlineEditId, setInlineEditId] = useState<number | null>(null);
  const [inlineEditData, setInlineEditData] = useState<{
    website: string;
    username: string;
    password: string;
    icon: string | null;
  }>({ website: '', username: '', password: '', icon: null });
  const [isTileIconDragging, setIsTileIconDragging] = useState(false);
  const [isInlineSaving, setIsInlineSaving] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [inlineProfileEdit, setInlineProfileEdit] = useState<InlineProfileEdit | null>(null);
  const [isProfileIconDragging, setIsProfileIconDragging] = useState(false);
  const [profileMetadata, setProfileMetadata] = useState<Record<string, ProfileMetadata>>({});
  const [createdProfiles, setCreatedProfiles] = useState<Profile[]>([]);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [decryptedPasswords, setDecryptedPasswords] = useState<Record<number, string>>({});

  const tileIconFileInputRef = useRef<HTMLInputElement>(null);
  const profileIconFileInputRef = useRef<HTMLInputElement>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const profileHoldTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [holdingEntryId, setHoldingEntryId] = useState<number | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null);
  const [holdingProfileName, setHoldingProfileName] = useState<string | null>(null);
  const [isDeletingProfileName, setIsDeletingProfileName] = useState<string | null>(null);
  const [flashingPasswordId, setFlashingPasswordId] = useState<number | null>(null);

  // Fetch entries from backend on mount
  useEffect(() => {
    fetchEntries()
      .then(setEntries)
      .catch((err) => {
        if (err.message === 'VAULT_LOCKED') {
          onLockVault();
        } else {
          console.error('Failed to load entries:', err);
        }
      });
  }, [onLockVault]);

  const togglePassword = useCallback(async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();

    const isVisible = visiblePasswords[id];
    if (isVisible) {
      // Hide it
      setVisiblePasswords((prev) => ({ ...prev, [id]: false }));
      return;
    }

    // Fetch decrypted password if not already cached
    if (!decryptedPasswords[id]) {
      try {
        const entry = await fetchEntryDetails(id);
        setDecryptedPasswords((prev) => ({ ...prev, [id]: entry.password ?? '' }));
      } catch (err) {
        console.error('Failed to decrypt entry:', err);
        return;
      }
    }

    setVisiblePasswords((prev) => ({ ...prev, [id]: true }));
  }, [visiblePasswords, decryptedPasswords]);

  const startHoldingDelete = useCallback((e: React.MouseEvent | React.TouchEvent, entryId: number) => {
    e.stopPropagation();
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldingEntryId(entryId);

    holdTimerRef.current = setTimeout(async () => {
      setIsDeletingId(entryId);
      setHoldingEntryId(null);
      holdTimerRef.current = null;
      try {
        const res = await fetch(`/api/entries/${entryId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete entry');
        const updatedEntries = await fetchEntries();
        setEntries(updatedEntries);
        setDecryptedPasswords(prev => {
          const next = { ...prev };
          delete next[entryId];
          return next;
        });
        setVisiblePasswords(prev => {
          const next = { ...prev };
          delete next[entryId];
          return next;
        });
      } catch (err) {
        console.error('Failed to delete entry:', err);
      } finally {
        setIsDeletingId(null);
      }
    }, 5000);
  }, []);

  const cancelHoldingDelete = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldingEntryId(null);
  }, []);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  // Group entries by username to create profiles
  const groupedItems = entries.reduce<Record<string, Profile>>((acc, item) => {
    const key = item.profile || 'Default';
    if (!acc[key]) {
      acc[key] = {
        name: key,
        domain: 'Profile',
        color: '#6366f1',
        icon: null,
        accounts: [],
        displayName: key,
        displayIcon: null,
      };
    }
    acc[key].accounts.push(item);
    return acc;
  }, {});

  const allProfiles: Profile[] = [
    ...Object.values(groupedItems),
    ...createdProfiles.filter((cp) => !groupedItems[cp.name]),
  ];

  const profiles: Profile[] = allProfiles.map((p) => {
    const meta = profileMetadata[p.name];
    return {
      ...p,
      displayName: meta?.customName || p.name,
      displayIcon: meta?.customImage || p.icon,
    };
  });

  const activeProfile = profiles.find(p => p.name === selectedProfile?.name) || selectedProfile;

  // Auto-select first profile
  useEffect(() => {
    if (!selectedProfile && profiles.length > 0) {
      setSelectedProfile(profiles[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles.length]);

  const startHoldingProfileDelete = useCallback((e: React.MouseEvent | React.TouchEvent, profile: Profile) => {
    e.stopPropagation();
    if (profileHoldTimerRef.current) {
      clearTimeout(profileHoldTimerRef.current);
      profileHoldTimerRef.current = null;
    }
    setHoldingProfileName(profile.name);

    profileHoldTimerRef.current = setTimeout(async () => {
      setIsDeletingProfileName(profile.name);
      setHoldingProfileName(null);
      profileHoldTimerRef.current = null;
      try {
        if (profile.accounts.length > 0) {
          await Promise.all(
            profile.accounts.map(acc => fetch(`/api/entries/${acc.id}`, { method: 'DELETE' }))
          );
        }

        setCreatedProfiles(prev => prev.filter(p => p.name !== profile.name));
        setProfileMetadata(prev => {
          const next = { ...prev };
          delete next[profile.name];
          return next;
        });

        const updatedEntries = await fetchEntries();
        setEntries(updatedEntries);

        setSelectedProfile(prev => {
          if (prev?.name === profile.name) {
            const remaining = profiles.filter(p => p.name !== profile.name);
            return remaining.length > 0 ? remaining[0] : null;
          }
          return prev;
        });
      } catch (err) {
        console.error('Failed to delete profile:', err);
      } finally {
        setIsDeletingProfileName(null);
      }
    }, 5000);
  }, [profiles]);

  const cancelHoldingProfileDelete = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    if (profileHoldTimerRef.current) {
      clearTimeout(profileHoldTimerRef.current);
      profileHoldTimerRef.current = null;
    }
    setHoldingProfileName(null);
  }, []);

  useEffect(() => {
    return () => {
      if (profileHoldTimerRef.current) {
        clearTimeout(profileHoldTimerRef.current);
      }
    };
  }, []);

  const handleProfileIconFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (!result) return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 128;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL(file.type.includes('png') ? 'image/png' : 'image/jpeg', 0.9);
          setInlineProfileEdit((prev) => prev ? ({ ...prev, icon: dataUrl }) : null);
        } else {
          setInlineProfileEdit((prev) => prev ? ({ ...prev, icon: result }) : null);
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleTileIconFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (!result) return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 128;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL(file.type.includes('png') ? 'image/png' : 'image/jpeg', 0.9);
          setInlineEditData((prev) => ({ ...prev, icon: dataUrl }));
        } else {
          setInlineEditData((prev) => ({ ...prev, icon: result }));
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleCreateProfile = useCallback(() => {
    setInlineProfileEdit({
      isNew: true,
      originalName: `profile_${Date.now()}`,
      name: '',
      icon: null,
    });
  }, []);

  const handleStartEditProfile = useCallback((e: React.MouseEvent, profile: Profile) => {
    e.stopPropagation();
    setInlineProfileEdit({
      isNew: false,
      originalName: profile.name,
      name: profile.displayName,
      icon: profile.displayIcon || null,
    });
  }, []);

  const handleCancelProfileEdit = useCallback(() => {
    setInlineProfileEdit(null);
  }, []);

  const handleSaveProfile = useCallback(() => {
    if (!inlineProfileEdit) return;

    const newName = inlineProfileEdit.name.trim();
    if (!newName) return;

    if (inlineProfileEdit.isNew) {
      const newProfile: Profile = {
        name: newName,
        domain: 'Profile',
        color: '#6366f1',
        icon: null,
        accounts: [],
        displayName: newName,
        displayIcon: inlineProfileEdit.icon || null,
      };
      setCreatedProfiles((prev) => [...prev, newProfile]);
      setProfileMetadata((prev) => ({
        ...prev,
        [newName]: {
          customName: newName,
          customImage: inlineProfileEdit.icon || undefined,
        },
      }));
      setSelectedProfile(newProfile);
    } else {
      // Update existing profile
      if (selectedProfile?.name === inlineProfileEdit.originalName) {
        setSelectedProfile((prev) => prev ? {
          ...prev,
          displayName: newName,
          displayIcon: inlineProfileEdit.icon || null,
        } : null);
      }

      setProfileMetadata((prev) => ({
        ...prev,
        [inlineProfileEdit.originalName]: {
          customName: newName,
          customImage: inlineProfileEdit.icon || undefined,
        },
      }));
    }

    setInlineProfileEdit(null);
  }, [inlineProfileEdit, selectedProfile]);

  const handleAddEntry = useCallback(() => {
    setInlineEditId(-1);
    setInlineEditData({ website: '', username: '', password: '', icon: null });
  }, []);

  const handleEditEntry = useCallback(async (e: React.MouseEvent, entry: VaultEntry) => {
    e.stopPropagation();
    try {
      setInlineEditId(entry.id);
      setInlineEditData({
        website: entry.website,
        username: entry.username,
        password: '...',
        icon: entry.icon || null,
      });
      
      // Fetch full entry details (including password) before editing
      const fullEntry = await fetchEntryDetails(entry.id);
      setInlineEditData({
        website: fullEntry.website,
        username: fullEntry.username,
        password: fullEntry.password || '',
        icon: fullEntry.icon || entry.icon || null,
      });
    } catch (err) {
      console.error('Failed to fetch entry details for editing:', err);
      setInlineEditId(null);
    }
  }, []);

  const handleSaveInline = useCallback(async (entry?: VaultEntry) => {
    setIsInlineSaving(true);
    try {
      const isNew = !entry;
      const url = isNew ? '/api/entries' : `/api/entries/${entry.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          website: inlineEditData.website.trim(),
          username: inlineEditData.username.trim(),
          password: inlineEditData.password,
          profile: entry?.profile || selectedProfile?.name || 'Default',
          icon: inlineEditData.icon,
        }),
      });
      if (!res.ok) throw new Error(isNew ? 'Failed to create entry' : 'Failed to update entry');
      
      setInlineEditId(null);
      // Refresh entries
      const updatedEntries = await fetchEntries();
      setEntries(updatedEntries);
      
      // Clear decrypted cache for this item to force refetch if user views it again
      if (!isNew) {
        setDecryptedPasswords(prev => ({...prev, [entry.id]: ''}));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsInlineSaving(false);
    }
  }, [inlineEditData, selectedProfile]);

  const handleCancelInline = useCallback(() => {
    setInlineEditId(null);
  }, []);

  const renderInlineEdit = (item?: VaultEntry) => {
    const currentIcon = inlineEditData.icon;
    return (
      <div key={item ? item.id : 'new'} className={`${styles.tile} ${styles.tileEditing}`}>
        <div className={styles.tileIconContainer}>
          <input
            ref={tileIconFileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onClick={(e) => {
              (e.target as HTMLInputElement).value = '';
            }}
            onChange={(e) => {
              if (e.target.files?.[0]) {
                handleTileIconFile(e.target.files[0]);
              }
            }}
          />
          <div
            className={`${styles.tileIconWrapper} ${styles.tileIconWrapperEditable} ${isTileIconDragging ? styles.tileIconWrapperDragging : ''}`}
            style={{ color: item?.color || '#818cf8' }}
            title="Click or drop image to update icon"
            onClick={() => tileIconFileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsTileIconDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsTileIconDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsTileIconDragging(false);
              if (e.dataTransfer.files?.[0]) {
                handleTileIconFile(e.dataTransfer.files[0]);
              }
            }}
          >
            {currentIcon ? (
              <img src={currentIcon} alt={inlineEditData.website || 'Icon'} className={styles.tileIconImg} />
            ) : (
              <span style={{ fontSize: '18px', fontWeight: 'bold', lineHeight: 1, textTransform: 'uppercase' }}>
                {inlineEditData.website?.[0] || '?'}
              </span>
            )}
            <div className={styles.tileIconOverlay}>
              <Camera size={14} />
            </div>
          </div>
          {currentIcon && (
            <button
              type="button"
              className={styles.tileIconRemoveBtn}
              title="Remove icon image"
              onClick={(e) => {
                e.stopPropagation();
                setInlineEditData((prev) => ({ ...prev, icon: null }));
              }}
            >
              <CloseIcon size={10} />
            </button>
          )}
        </div>
        <div className={styles.tileContent}>
          <input
            type="text"
            value={inlineEditData.website}
            onChange={(e) => setInlineEditData(prev => ({ ...prev, website: e.target.value }))}
            className={styles.inlineInput}
            placeholder="Website"
          />
        </div>
        <div className={styles.tileUsernameContainer}>
          <input
            type="text"
            value={inlineEditData.username}
            onChange={(e) => setInlineEditData(prev => ({ ...prev, username: e.target.value }))}
            className={styles.inlineInput}
            placeholder="Username"
          />
        </div>
        <div className={styles.tilePasswordContainer}>
          <input
            type="text"
            value={inlineEditData.password === '...' ? '' : inlineEditData.password}
            onChange={(e) => setInlineEditData(prev => ({ ...prev, password: e.target.value }))}
            className={styles.inlineInput}
            placeholder="Password"
            disabled={inlineEditData.password === '...'}
          />
        </div>
        <div className={styles.inlineActions}>
          <button 
            className={styles.inlineSaveBtn} 
            onClick={() => handleSaveInline(item)}
            disabled={isInlineSaving || inlineEditData.password === '...'}
          >
            {isInlineSaving ? 'Saving...' : 'Save'}
          </button>
          <button 
            className={styles.inlineCancelBtn} 
            onClick={handleCancelInline}
            disabled={isInlineSaving}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const renderProfileInlineEdit = () => {
    if (!inlineProfileEdit) return null;
    const currentIcon = inlineProfileEdit.icon;
    const profileColor = (!inlineProfileEdit.isNew && profiles.find(p => p.name === inlineProfileEdit.originalName)?.color) || '#6366f1';

    return (
      <div
        key={inlineProfileEdit.isNew ? 'new-profile' : inlineProfileEdit.originalName}
        className={`${styles.navItem} ${styles.navItemEditing}`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={profileIconFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onClick={(e) => {
            (e.target as HTMLInputElement).value = '';
          }}
          onChange={(e) => {
            if (e.target.files?.[0]) {
              handleProfileIconFile(e.target.files[0]);
            }
          }}
        />

        <div className={styles.profileIconContainer}>
          <div
            className={`${styles.profileIcon} ${styles.profileIconEditable} ${isProfileIconDragging ? styles.profileIconDragging : ''}`}
            style={{
              background: currentIcon ? 'transparent' : profileColor,
            }}
            title="Click or drop image to update icon"
            onClick={() => profileIconFileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsProfileIconDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsProfileIconDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsProfileIconDragging(false);
              if (e.dataTransfer.files?.[0]) {
                handleProfileIconFile(e.dataTransfer.files[0]);
              }
            }}
          >
            {currentIcon ? (
              <img src={currentIcon} alt={inlineProfileEdit.name || 'Profile'} className={styles.profileIconImg} />
            ) : (
              <span className={styles.profileIconText}>
                {inlineProfileEdit.name?.[0] || '?'}
              </span>
            )}
            <div className={styles.profileIconOverlay}>
              <Camera size={13} />
            </div>
          </div>
          {currentIcon && (
            <button
              type="button"
              className={styles.profileIconRemoveBtn}
              title="Remove icon image"
              onClick={(e) => {
                e.stopPropagation();
                setInlineProfileEdit((prev) => prev ? ({ ...prev, icon: null }) : null);
              }}
            >
              <CloseIcon size={8} />
            </button>
          )}
        </div>

        <input
          type="text"
          className={styles.profileInlineInput}
          value={inlineProfileEdit.name}
          placeholder="Profile name"
          autoFocus
          onChange={(e) => setInlineProfileEdit(prev => prev ? ({ ...prev, name: e.target.value }) : null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveProfile();
            if (e.key === 'Escape') handleCancelProfileEdit();
          }}
        />

        <div className={styles.profileInlineActions}>
          <button
            type="button"
            className={styles.profileSaveBtn}
            onClick={handleSaveProfile}
            title="Save changes"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            className={styles.profileCancelBtn}
            onClick={handleCancelProfileEdit}
            title="Cancel"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.dashboard}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandLogoContainer}>
            <img
              src="/logo.png"
              alt="Keybox Logo"
              className={styles.brandLogoImage}
            />
          </div>
          <span className={styles.brandName}>Keybox</span>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navHeader}>
            <div className={styles.sectionTitle} style={{ margin: 0 }}>Profiles</div>
            <button className={styles.addProfileBtn} onClick={handleCreateProfile} title="Add Profile">
              <Plus size={14} />
            </button>
          </div>

          {inlineProfileEdit?.isNew && renderProfileInlineEdit()}

          {profiles.map((profile, index) => {
            const isEditing = inlineProfileEdit && !inlineProfileEdit.isNew && inlineProfileEdit.originalName === profile.name;
            if (isEditing) {
              return renderProfileInlineEdit();
            }

            return (
              <div
                key={profile.name + index}
                className={`${styles.navItem} ${selectedProfile?.name === profile.name ? styles.active : ''}`}
                onClick={() => {
                  setSelectedProfile(profile);
                  setInlineEditId(null);
                }}
              >
                <div
                  className={styles.profileIcon}
                  style={{ background: profile.color || '#333' }}
                >
                  {profile.displayIcon ? (
                    <img src={profile.displayIcon} alt={profile.displayName} className={styles.profileIconImg} />
                  ) : (
                    <span className={styles.profileIconText}>{profile.displayName?.[0] || '?'}</span>
                  )}
                </div>
                <span className={styles.profileNameText}>{profile.displayName}</span>
                <div className={`${styles.profileActions} ${holdingProfileName === profile.name ? styles.isHoldingAny : ''}`}>
                  <button
                    className={styles.editProfileBtn}
                    onClick={(e) => handleStartEditProfile(e, profile)}
                    title="Edit Profile"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    type="button"
                    className={`${styles.deleteProfileBtn} ${holdingProfileName === profile.name ? styles.isHolding : ''}`}
                    onMouseDown={(e) => startHoldingProfileDelete(e, profile)}
                    onMouseUp={cancelHoldingProfileDelete}
                    onMouseLeave={cancelHoldingProfileDelete}
                    onTouchStart={(e) => startHoldingProfileDelete(e, profile)}
                    onTouchEnd={cancelHoldingProfileDelete}
                    onTouchCancel={cancelHoldingProfileDelete}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.preventDefault()}
                    title="Delete"
                    disabled={isDeletingProfileName === profile.name}
                  >
                    <svg className={styles.holdProgressRing} viewBox="0 0 32 32">
                      <circle className={styles.holdProgressBg} cx="16" cy="16" r="13" />
                      <circle className={styles.holdProgressFill} cx="16" cy="16" r="13" />
                    </svg>
                    <Trash2 className={styles.deleteProfileIcon} />
                  </button>
                </div>
                <span className={styles.badge}>{profile.accounts.length}</span>
              </div>
            );
          })}
        </nav>

        <div className={styles.settings}>
          <Settings className={styles.navIcon} />
          <span>Settings</span>
        </div>
      </aside>

      {/* Main Content */}
      <main className={styles.main}>
        <>
          {/* Top Header */}
          <header className={styles.header}>
            <div className={styles.headerLeftGroup}>
              <div className={styles.searchBar}>
                <Search className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder={activeProfile ? `Search in ${activeProfile.displayName}...` : 'Search your vault...'}
                  className={styles.searchInput}
                />
              </div>
            </div>
            <div className={styles.actionsGroup}>
              <button className={styles.addButton} onClick={handleAddEntry}>
                <Plus className={styles.addIcon} />
                Add New
              </button>

                <div className={styles.windowControlsWrapper}>
                  <Navbar isUnlocked={true} onLockVault={onLockVault} />
                </div>
              </div>
            </header>

            {/* List */}
            <div className={styles.list}>
              {!activeProfile ? (
                <div className={styles.emptyState}>
                  <User size={48} className={styles.emptyStateIcon} />
                  <h3 className={styles.emptyStateTitle}>Select a Profile</h3>
                  <p className={styles.emptyStateDesc}>Choose a profile from the sidebar to view its associated accounts.</p>
                </div>
              ) : activeProfile.accounts.length === 0 && inlineEditId !== -1 ? (
                <div className={styles.emptyState}>
                  <User size={48} className={styles.emptyStateIcon} />
                  <h3 className={styles.emptyStateTitle}>No Entries</h3>
                  <p className={styles.emptyStateDesc}>This profile has no saved credentials yet. Click &ldquo;Add New&rdquo; to get started.</p>
                </div>
              ) : (
                <>
                  {activeProfile.accounts.map((item) => {
                  const isEditingInline = inlineEditId === item.id;
                  
                  if (isEditingInline) {
                    return renderInlineEdit(item);
                  }

                  return (
                  <div key={item.id} className={styles.tile}>
                    <div className={styles.tileIconContainer}>
                      <div className={styles.tileIconWrapper} style={{ color: item.color || '#818cf8' }}>
                        {item.icon ? (
                          <img src={item.icon} alt={item.website} className={styles.tileIconImg} />
                        ) : (
                          <span style={{ fontSize: '18px', fontWeight: 'bold', lineHeight: 1, textTransform: 'uppercase' }}>{item.website?.[0] || '?'}</span>
                        )}
                      </div>
                    </div>

                    <div className={styles.tileContent}>
                      <h3 className={styles.tileTitle}>{item.website}</h3>
                    </div>

                    <div className={styles.tileUsernameContainer}>
                      <span className={styles.tileUsernameText}>{item.username}</span>
                    </div>

                    <div className={styles.tilePasswordContainer}>
                      <span 
                        className={styles.tilePasswordText}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (visiblePasswords[item.id] && decryptedPasswords[item.id]) {
                            navigator.clipboard.writeText(decryptedPasswords[item.id]);
                            setFlashingPasswordId(item.id);
                            setTimeout(() => {
                              setFlashingPasswordId((prev) => (prev === item.id ? null : prev));
                            }, 200);
                          }
                        }}
                        style={{ 
                          cursor: visiblePasswords[item.id] ? 'pointer' : 'default',
                          opacity: flashingPasswordId === item.id ? 0.35 : undefined
                        }}
                        title={visiblePasswords[item.id] ? "Click to copy password" : ""}
                      >
                        {visiblePasswords[item.id] ? (decryptedPasswords[item.id] || '••••••••') : '••••••••'}
                      </span>
                      <button
                        onClick={(e) => togglePassword(e, item.id)}
                        className={styles.tilePasswordToggleBtn}
                      >
                        {visiblePasswords[item.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>

                    <div className={styles.tileActions}>
                      <button
                        className={styles.tileEditBtn}
                        onClick={(e) => handleEditEntry(e, item)}
                        title="Edit entry"
                      >
                        <Edit2 size={14} className={styles.actionIcon} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.tileDeleteBtn} ${holdingEntryId === item.id ? styles.isHolding : ''}`}
                        onMouseDown={(e) => startHoldingDelete(e, item.id)}
                        onMouseUp={cancelHoldingDelete}
                        onMouseLeave={cancelHoldingDelete}
                        onTouchStart={(e) => startHoldingDelete(e, item.id)}
                        onTouchEnd={cancelHoldingDelete}
                        onTouchCancel={cancelHoldingDelete}
                        onClick={(e) => e.stopPropagation()}
                        onContextMenu={(e) => e.preventDefault()}
                        title="Delete"
                        disabled={isDeletingId === item.id}
                      >
                        <svg className={styles.holdProgressRing} viewBox="0 0 32 32">
                          <circle className={styles.holdProgressBg} cx="16" cy="16" r="13" />
                          <circle className={styles.holdProgressFill} cx="16" cy="16" r="13" />
                        </svg>
                        <Trash2 className={styles.deleteIcon} />
                      </button>
                    </div>
                  </div>
                  );
                })}
                {inlineEditId === -1 && renderInlineEdit()}
              </>
            )}
          </div>
        </>
      </main>
    </div>
  );
};
