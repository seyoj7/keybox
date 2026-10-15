"use client";

import { useEffect } from "react";
import { apiFetch } from "../lib/apiFetch";

export function PreferenceBootstrap() {
  useEffect(() => {
    let active = true;
    apiFetch("/api/settings")
      .then((response) => (response.ok ? response.json() : null))
      .then((settings) => {
        if (
          !active ||
          !settings ||
          !["dark", "light", "system"].includes(settings.theme)
        )
          return;
        localStorage.setItem("theme", settings.theme);
        const dark =
          settings.theme === "dark" ||
          (settings.theme === "system" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);
        document.documentElement.setAttribute(
          "data-theme",
          dark ? "dark" : "light",
        );
      })
      .catch((error) => console.error("Failed to load saved theme", error));
    return () => {
      active = false;
    };
  }, []);

  return null;
}
