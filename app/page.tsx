"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Lock, Eye, EyeOff, ArrowRight, Fingerprint, CheckCircle2 } from "lucide-react";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";

import { Modal } from "./components/Modal";
import SideRays from "./components/SideRays";
import SpecularButton from "./components/SpecularButton";
import { VaultDashboard } from "./vault/VaultDashboard";
import styles from "./page.module.css";

// ── API helpers ─────────────────────────────────────────────

async function fetchVaultStatus(): Promise<boolean | null> {
  const res = await fetch("/api/status");
  if (!res.ok) return null;
  const data = await res.json();
  return data.initialized;
}

async function initializeVault(password: string): Promise<void> {
  const res = await fetch("/api/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Failed to initialize vault");
}

async function unlockVault(password: string): Promise<void> {
  const res = await fetch("/api/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Failed to unlock vault");
}

async function lockVault(): Promise<void> {
  await fetch("/api/lock", { method: "POST" });
}

// ── Component ───────────────────────────────────────────────

export default function Home() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isVaultInitialized, setIsVaultInitialized] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchVaultStatus()
      .then((initialized) => {
        if (initialized !== null) setIsVaultInitialized(initialized);
      })
      .catch((err) => console.error("Failed to check vault status:", err));
  }, []);

  const handleUnlock = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!password) return;

      if (isVaultInitialized === false && password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }

      setError(null);
      try {
        if (isVaultInitialized === false) {
          await initializeVault(password);
          setIsVaultInitialized(true);
        } else {
          await unlockVault(password);
        }
        setIsUnlocked(true);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "An error occurred";
        setError(message);
      }
    },
    [password, confirmPassword, isVaultInitialized]
  );

  const handleLockVault = useCallback(async () => {
    await lockVault();
    setIsUnlocked(false);
    setPassword("");
    setConfirmPassword("");
  }, []);

  const handleOpenHello = useCallback(async () => {
    try {
      if (!window.PublicKeyCredential) {
        throw new Error("Windows Hello (WebAuthn) is not supported on this device.");
      }

      setError(null);

      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const userId = new Uint8Array(16);
      window.crypto.getRandomValues(userId);

      // Trigger the native Windows Hello / OS authentication prompt
      await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: "Keybox Vault",
          },
          user: {
            id: userId,
            name: "user@keybox.local",
            displayName: "Keybox User",
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 }
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
          },
          timeout: 60000,
        }
      });

      // In a production environment, Windows Hello (WebAuthn) should use the PRF extension 
      // to derive a key to decrypt the vault, rather than caching the master password.
      // Since caching the master password in plain text is a security risk, 
      // this feature is disabled until PRF is implemented.
      throw new Error("Windows Hello is currently disabled for security. Please use your master password.");
    } catch (err: any) {
      console.error(err);
      if (err.name === "NotAllowedError") {
        setError("Windows Hello authentication was cancelled.");
      } else {
        setError(err.message || "Failed to authenticate with Windows Hello.");
      }
    }
  }, []);

  // ── Unlocked state: Vault dashboard ───────────────────────

  if (isUnlocked) {
    return (
      <div className={styles.pageContainer}>
        <main className={styles.mainFrame}>
          <VaultDashboard onLockVault={handleLockVault} />
        </main>
      </div>
    );
  }

  // ── Locked state: Login screen ────────────────────────────

  const isSetupMode = isVaultInitialized === false;

  return (
    <div className={styles.pageContainer}>
      <main className={styles.mainFrame}>
        {/* Background Ambient Glowing Ribbon Wave */}
        <div className={styles.backgroundAura}>
          <div className={styles.baseDarkCanvas} />
          <div style={{ position: 'absolute', inset: 0, opacity: 0.6 }}>
            <SideRays
              speed={2.5}
              rayColor1="#EAB308"
              rayColor2="#96c8ff"
              intensity={2}
              spread={2}
              origin="top-right"
              tilt={0}
              saturation={1.5}
              blend={0.75}
              falloff={1.6}
              opacity={1.0}
            />
          </div>
        </div>

        {/* Window Top Titlebar */}
        <Navbar />

        {/* Center Content */}
        <div className={styles.centerContent}>
          <h1 className={styles.mainTitle}>
            Keep your passwords
            <br />
            <span className={styles.titleHighlight}>Safe & Secure.</span>
          </h1>

          <p className={styles.subtitle}>
            {isSetupMode
              ? "Set up your vault with a strong master password."
              : "Everything stays encrypted on this device."}
          </p>

          {/* Master Password Form */}
          <form onSubmit={handleUnlock} className={styles.masterPasswordForm}>
            <div className={styles.inputContainer}>
              <Lock className={styles.lockIcon} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSetupMode ? "Create Master Password" : "Master Password"}
                className={styles.passwordInput}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Hide password" : "Show password"}
                className={styles.eyeButton}
              >
                {showPassword ? <Eye className={styles.eyeIcon} /> : <EyeOff className={styles.eyeIcon} />}
              </button>
            </div>

            {isSetupMode && (
              <div className={styles.inputContainer}>
                <Lock className={styles.lockIcon} />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm Master Password"
                  className={styles.passwordInput}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  title={showConfirmPassword ? "Hide password" : "Show password"}
                  className={styles.eyeButton}
                >
                  {showConfirmPassword ? <Eye className={styles.eyeIcon} /> : <EyeOff className={styles.eyeIcon} />}
                </button>
              </div>
            )}

            {error && (
              <div className={styles.errorMessage}>{error}</div>
            )}

            {/* Unlock Vault Button */}
            <SpecularButton
              type="submit"
              size="lg"
              radius={14}
              tint="var(--accent-primary)"
              tintOpacity={1}
              textColor="var(--accent-btn-text)"
              lineColor="#ffffff"
              baseColor="#6366f1"
              intensity={1}
              shineSize={15}
              shineFade={30}
              thickness={1.5}
              speed={0.35}
              followMouse={true}
              proximity={0}
              animateOnlyOnHover={true}
              className={styles.unlockButton}
            >
              <span>{isSetupMode ? "Create Vault" : "Unlock Vault"}</span>
              <ArrowRight className={styles.arrowIcon} />
            </SpecularButton>
          </form>

          {/* "or" Divider */}
          <div className={styles.dividerContainer}>
            <div className={styles.dividerLine} />
            <span className={styles.dividerText}>or</span>
            <div className={styles.dividerLine} />
          </div>

          {/* Windows Hello Card */}
          <SpecularButton
            type="button"
            onClick={handleOpenHello}
            size="lg"
            radius={16}
            tint="var(--bg-surface)"
            tintOpacity={0.8}
            blur={14}
            textColor="var(--text-main)"
            lineColor="#818cf8"
            baseColor="#263147"
            intensity={1.1}
            shineSize={20}
            shineFade={35}
            thickness={1.3}
            speed={0.3}
            followMouse={true}
            proximity={0}
            animateOnlyOnHover={true}
            className={styles.helloCard}
          >
            <div className={styles.helloContent}>
              <div className={styles.helloIconContainer}>
                <Fingerprint className={styles.helloFingerprint} />
              </div>
              <div className={styles.helloTextContainer}>
                <div className={styles.helloTitle}>Use Windows Hello</div>
                <div className={styles.helloSubtitle}>Sign in with your fingerprint</div>
              </div>
            </div>
          </SpecularButton>
        </div>

        {/* Footer */}
        <Footer />

      </main>
    </div>
  );
}
