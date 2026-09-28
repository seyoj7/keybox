// afterPack hook – runs after electron-builder packs the app
// but before the installer is created.
//
// electron-builder filters out node_modules from extraResources,
// but the Next.js standalone server.js needs its own node_modules
// (containing the 'next' package). We copy it manually here.

const fs = require("fs");
const path = require("path");

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

exports.default = async function afterPack(context) {
  console.log("[afterPack] Platform:", context.electronPlatformName);
  console.log("[afterPack] App out dir:", context.appOutDir);

  const src = path.join(
    context.packager.projectDir,
    ".next",
    "standalone",
    "node_modules"
  );
  const dest = path.join(
    context.appOutDir,
    "resources",
    "app",
    "node_modules"
  );

  if (!fs.existsSync(src)) {
    console.error("[afterPack] ERROR: standalone node_modules not found at:", src);
    return;
  }

  console.log("[afterPack] Copying standalone node_modules …");
  console.log("[afterPack]   from:", src);
  console.log("[afterPack]   to:  ", dest);

  copyDirSync(src, dest);

  console.log("[afterPack] Done – standalone node_modules copied.");
};
