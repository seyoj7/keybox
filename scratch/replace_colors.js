const fs = require('fs');
const path = require('path');

const cssFiles = [
  'e:/Programs/keybox/app/vault/VaultDashboard.module.css',
  'e:/Programs/keybox/app/settings/SettingsPage.module.css',
  'e:/Programs/keybox/app/components/Navbar.module.css',
  'e:/Programs/keybox/app/page.module.css',
];

const colorMap = {
  '#0d1117': 'var(--bg-content)',
  '#11141d': 'var(--bg-sidebar)',
  '#161b22': 'var(--bg-surface)',
  '#1c212b': 'var(--bg-surface-hover)',
  '#1e2433': 'var(--bg-active)',
  '#ffffff': 'var(--text-main)',
  '#f1f5f9': 'var(--text-main)',
  '#e2e8f0': 'var(--text-main)',
  '#8e98a8': 'var(--text-muted)',
  '#8390a4': 'var(--text-muted)',
  '#525e73': 'var(--text-dim)',
  '#818cf8': 'var(--accent-primary)',
  '#0b0f1a': 'var(--accent-btn-text)',
  'rgba(255, 255, 255, 0.03)': 'var(--border-subtle)',
  'rgba(255, 255, 255, 0.04)': 'var(--border-subtle)',
  'rgba(255, 255, 255, 0.05)': 'var(--border-subtle)',
  'rgba(255, 255, 255, 0.07)': 'var(--border-medium)',
  'rgba(255, 255, 255, 0.08)': 'var(--border-medium)',
  'rgba(255, 255, 255, 0.1)': 'var(--border-strong)',
  'rgba(255, 255, 255, 0.2)': 'var(--border-strong)',
  'rgba(255, 255, 255, 0.12)': 'var(--border-strong)',
  'rgba(255, 255, 255, 0.25)': 'var(--border-strong)',
  '#cbd5e1': 'var(--text-muted)'
};

for (const file of cssFiles) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    for (const [hex, cssVar] of Object.entries(colorMap)) {
      // Create a case-insensitive regex for the hex/rgba string.
      // Escape parentheses in rgba strings
      const escapedStr = hex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedStr, 'gi');
      content = content.replace(regex, cssVar);
    }
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  } else {
    console.warn(`File not found: ${file}`);
  }
}
