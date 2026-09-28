"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Minus, Square, X } from "lucide-react";
import styles from "./Navbar.module.css";

interface NavbarProps {
  isUnlocked?: boolean;
  onLockVault?: () => void;
}

// Access the Electron API exposed via preload (undefined in browser)
const electronAPI = typeof window !== "undefined"
  ? (window as unknown as { electron?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
    } }).electron
  : undefined;

export const Navbar: React.FC<NavbarProps> = ({
  isUnlocked = false,
  onLockVault,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  // Sync maximized state when the window resizes
  useEffect(() => {
    if (!electronAPI) return;

    const syncMaximized = async () => {
      const maximized = await electronAPI.isMaximized();
      setIsMaximized(maximized);
    };

    window.addEventListener("resize", syncMaximized);
    return () => window.removeEventListener("resize", syncMaximized);
  }, []);

  const handleMinimize = useCallback(() => {
    electronAPI?.minimize();
  }, []);

  const handleToggleMaximize = useCallback(() => {
    if (electronAPI) {
      electronAPI.maximize();
      setIsMaximized((prev) => !prev);
    } else {
      // Fallback for browser
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        setIsMaximized(true);
      } else {
        document.exitFullscreen?.().catch(() => {});
        setIsMaximized(false);
      }
    }
  }, []);

  const handleClose = useCallback(() => {
    electronAPI?.close();
  }, []);

  return (
    <header className={styles.navbar}>
      {/* Brand logo & name */}
      <div className={styles.brandGroup}>
        <div className={styles.logoContainer}>
          <img
            src="/logo.png"
            alt="Keybox Logo"
            className={styles.logoImage}
          />
        </div>
        <span className={styles.brandName}>Keybox</span>

        {isUnlocked && (
          <span className={styles.unlockedBadge}>Unlocked</span>
        )}
      </div>

      {/* Window Controls */}
      <div className={styles.controlsGroup}>
        {isUnlocked && onLockVault && (
          <button
            onClick={onLockVault}
            title="Lock Vault"
            className={styles.lockButton}
          >
            Lock Vault
          </button>
        )}

        {/* Minimize */}
        <button
          onClick={handleMinimize}
          aria-label="Minimize"
          title="Minimize"
          className={styles.windowButton}
        >
          <Minus size={15} strokeWidth={2} />
        </button>

        {/* Maximize */}
        <button
          onClick={handleToggleMaximize}
          aria-label="Maximize"
          title={isMaximized ? "Restore" : "Maximize"}
          className={styles.windowButton}
        >
          <Square size={13} strokeWidth={2} />
        </button>

        {/* Close */}
        <button
          onClick={handleClose}
          aria-label="Close"
          title="Close"
          className={`${styles.windowButton} ${styles.closeButton}`}
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
};
