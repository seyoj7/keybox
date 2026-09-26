"use client";

import React from "react";
import styles from "./Footer.module.css";

export const Footer: React.FC = () => {
  return (
    <footer className={styles.footer}>
      <p className={styles.footerText}>
        Your data never leaves this device.
      </p>
    </footer>
  );
};
