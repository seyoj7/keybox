"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Minus, Square, X } from "lucide-react";
import styles from "./Navbar.module.css";

interface NavbarProps {
  isUnlocked?: boolean;
  onLockVault?: () => void;
}

type ElectronWindowAPI = {
  minimize: () => Promise<void>;
  maximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onWindowStateChanged?: (callback: (state: { maximized: boolean }) => void) => () => void;
};

function getElectronAPI(): ElectronWindowAPI | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { electron?: ElectronWindowAPI }).electron;
}

export const Navbar: React.FC<NavbarProps> = ({
  isUnlocked = false,
  onLockVault,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  // Sync maximized state when the window resizes
  useEffect(() => {
    const electronAPI = getElectronAPI();
    if (!electronAPI) return;

    const syncMaximized = async () => {
      try {
        setIsMaximized(await electronAPI.isMaximized());
      } catch (error) {
        console.error("Could not read Electron window state:", error);
      }
    };

    window.addEventListener("resize", syncMaximized);
    const unsubscribe = electronAPI.onWindowStateChanged?.((state) => {
      setIsMaximized(state.maximized);
    });
    void syncMaximized();
    return () => {
      window.removeEventListener("resize", syncMaximized);
      unsubscribe?.();
    };
  }, []);

  const handleMinimize = useCallback(() => {
    void getElectronAPI()?.minimize().catch((error) => {
      console.error("Could not minimize Keybox:", error);
    });
  }, []);

  const handleToggleMaximize = useCallback(() => {
    const electronAPI = getElectronAPI();
    if (electronAPI) {
      void electronAPI.maximize().then(setIsMaximized).catch((error) => {
        console.error("Could not change Keybox window size:", error);
      });
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
    void getElectronAPI()?.close().catch((error) => {
      console.error("Could not close Keybox:", error);
    });
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
