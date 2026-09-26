"use client";

import React, { useState, useCallback } from "react";
import { Minus, Square, X } from "lucide-react";
import styles from "./Navbar.module.css";

interface NavbarProps {
  isUnlocked?: boolean;
  onLockVault?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  isUnlocked = false,
  onLockVault,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  const handleToggleMaximize = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsMaximized(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsMaximized(false);
    }
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
