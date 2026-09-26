import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Plus, Star, User, Settings,
  Edit2, X as CloseIcon, Image as ImageIcon, Eye, EyeOff
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

interface EditingProfile extends Partial<Profile> {
  isNew?: boolean;
  name: string;
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
  const [inlineEditData, setInlineEditData] = useState({ website: '', username: '', password: '' });
  const [isInlineSaving, setIsInlineSaving] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [editingProfile, setEditingProfile] = useState<EditingProfile | null>(null);
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [profileMetadata, setProfileMetadata] = useState<Record<string, ProfileMetadata>>({});
  const [createdProfiles, setCreatedProfiles] = useState<Profile[]>([]);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [decryptedPasswords, setDecryptedPasswords] = useState<Record<number, string>>({});

  const editNameRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Auto-select first profile
  useEffect(() => {
    if (!selectedProfile && profiles.length > 0) {
      setSelectedProfile(profiles[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles.length]);

  const handleSaveProfile = useCallback(() => {
    if (!editingProfile) return;

    const newName = editNameRef.current?.value || editingProfile.name;

    if (editingProfile.isNew) {
      const newProfile: Profile = {
        name: newName,
        domain: 'Profile',
        color: editingProfile.color || '#6366f1',
        icon: null,
        accounts: [],
        displayName: newName || 'New Profile',
        displayIcon: tempImage || null,
      };
      setCreatedProfiles((prev) => [...prev, newProfile]);
      setProfileMetadata((prev) => ({
        ...prev,
        [newProfile.name]: {
          customName: newName || 'New Profile',
          customImage: tempImage || undefined,
        },
      }));
    } else {
      // Update existing profile
      if (selectedProfile?.name === editingProfile.name) {
        setSelectedProfile({
          ...selectedProfile,
          displayName: newName || editingProfile.name,
          displayIcon: tempImage || null,
        });
      }

      setProfileMetadata((prev) => ({
        ...prev,
        [editingProfile.name]: {
          customName: newName,
          customImage: tempImage || undefined,
        },
      }));
    }

    setEditingProfile(null);
    setTempImage(null);
  }, [editingProfile, tempImage, selectedProfile]);

  const handleCloseEditModal = useCallback(() => {
    setEditingProfile(null);
    setTempImage(null);
  }, []);

  const handleImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setTempImage(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleCreateProfile = useCallback(() => {
    setEditingProfile({
      isNew: true,
      name: `profile_${Date.now()}`,
      displayName: '',
      displayIcon: null,
      accounts: [],
      color: '#6366f1',
      domain: 'Profile',
    });
    setTempImage(null);
  }, []);

  const handleAddEntry = useCallback(() => {
    setInlineEditId(-1);
    setInlineEditData({ website: '', username: '', password: '' });
  }, []);

  const handleEditEntry = useCallback(async (e: React.MouseEvent, entry: VaultEntry) => {
    e.stopPropagation();
    try {
      setInlineEditId(entry.id);
      setInlineEditData({ website: entry.website, username: entry.username, password: '...' });
      
      // Fetch full entry details (including password) before editing
      const fullEntry = await fetchEntryDetails(entry.id);
      setInlineEditData({
        website: fullEntry.website,
        username: fullEntry.username,
        password: fullEntry.password || '',
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

  const renderInlineEdit = (item?: VaultEntry) => (
    <div key={item ? item.id : 'new'} className={styles.tile}>
      <div className={styles.tileIconWrapper} style={{ color: item?.color || '#818cf8' }}>
        {item?.icon ? (
          <img src={item.icon} alt={item.website} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{inlineEditData.website?.[0] || '?'}</span>
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
            <button className={styles.addProfileBtn} onClick={handleCreateProfile}>
              <Plus size={14} />
            </button>
          </div>

          {profiles.map((profile, index) => (
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
              <button
                className={styles.editProfileBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingProfile(profile);
                  setTempImage(profile.displayIcon || null);
                }}
              >
                <Edit2 size={12} />
              </button>
              <span className={styles.badge}>{profile.accounts.length}</span>
            </div>
          ))}
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
                  placeholder={selectedProfile ? `Search in ${selectedProfile.displayName}...` : 'Search your vault...'}
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
              {!selectedProfile ? (
                <div className={styles.emptyState}>
                  <User size={48} className={styles.emptyStateIcon} />
                  <h3 className={styles.emptyStateTitle}>Select a Profile</h3>
                  <p className={styles.emptyStateDesc}>Choose a profile from the sidebar to view its associated accounts.</p>
                </div>
              ) : selectedProfile.accounts.length === 0 && inlineEditId !== -1 ? (
                <div className={styles.emptyState}>
                  <User size={48} className={styles.emptyStateIcon} />
                  <h3 className={styles.emptyStateTitle}>No Entries</h3>
                  <p className={styles.emptyStateDesc}>This profile has no saved credentials yet. Click &ldquo;Add New&rdquo; to get started.</p>
                </div>
              ) : (
                <>
                  {selectedProfile.accounts.map((item) => {
                  const isEditingInline = inlineEditId === item.id;
                  
                  if (isEditingInline) {
                    return renderInlineEdit(item);
                  }

                  return (
                  <div key={item.id} className={styles.tile}>
                    <div className={styles.tileIconWrapper} style={{ color: item.color || '#818cf8' }}>
                      {item.icon ? (
                        <img src={item.icon} alt={item.website} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      ) : (
                        <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{item.website?.[0] || '?'}</span>
                      )}
                    </div>

                    <div className={styles.tileContent}>
                      <h3 className={styles.tileTitle}>{item.website}</h3>
                    </div>

                    <div className={styles.tileUsernameContainer}>
                      <span className={styles.tileUsernameText}>{item.username}</span>
                    </div>

                    <div className={styles.tilePasswordContainer}>
                      <span className={styles.tilePasswordText}>
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
                      <button className={styles.tilePasswordToggleBtn} onClick={(e) => handleEditEntry(e, item)}>
                        <Edit2 className={styles.actionIcon} />
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

        {/* Edit Profile Modal */}
        {editingProfile && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>
                  {editingProfile.isNew ? 'Create Profile' : 'Edit Profile'}
                </h2>
                <button onClick={handleCloseEditModal} className={styles.modalCloseBtn}>
                  <CloseIcon size={18} />
                </button>
              </div>

              <div className={styles.modalFormGroup}>
                <label className={styles.modalLabel}>Profile Name</label>
                <input
                  ref={editNameRef}
                  type="text"
                  defaultValue={editingProfile.displayName}
                  className={styles.modalInput}
                />
              </div>

              <div className={styles.modalFormGroup}>
                <label className={styles.modalLabel}>Profile Image</label>
                <div
                  className={styles.modalImageUpload}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = '#6366f1';
                    e.currentTarget.style.background = 'rgba(99,102,241,0.05)';
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    if (e.dataTransfer.files?.[0]) {
                      handleImageFile(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleImageFile(e.target.files[0]);
                      }
                    }}
                  />

                  {tempImage ? (
                    <div className={styles.modalImagePreview}>
                      <img src={tempImage} className={styles.modalImagePreviewImg} alt="Profile preview" />
                    </div>
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                      <ImageIcon size={20} color="#8e98a8" />
                    </div>
                  )}

                  <span style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500, marginBottom: 4 }}>
                    Click to upload or drag and drop
                  </span>
                  <span style={{ fontSize: 12, color: '#8e98a8' }}>
                    SVG, PNG, JPG or GIF
                  </span>
                </div>
              </div>

              <div className={styles.modalActionGroup}>
                <button onClick={handleCloseEditModal} className={styles.modalCancelBtn}>
                  Cancel
                </button>
                <button onClick={handleSaveProfile} className={styles.modalSaveBtn}>
                  {editingProfile.isNew ? 'Create' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
