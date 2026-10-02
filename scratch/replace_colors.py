import os
import re

css_files = [
    r"e:\Programs\keybox\app\vault\VaultDashboard.module.css",
    r"e:\Programs\keybox\app\settings\SettingsPage.module.css",
    r"e:\Programs\keybox\app\components\Navbar.module.css",
]

color_map = {
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
}

for file_path in css_files:
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        for hex_code, css_var in color_map.items():
            # escape parenthesis in rgba strings
            escaped_hex = re.escape(hex_code)
            content = re.sub(escaped_hex, css_var, content, flags=re.IGNORECASE)
            
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {file_path}")
    else:
        print(f"File not found: {file_path}")
