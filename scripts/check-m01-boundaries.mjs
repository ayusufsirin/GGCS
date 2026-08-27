import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const coreDir = path.join(root, "packages", "core");
const corePackage = JSON.parse(fs.readFileSync(path.join(coreDir, "package.json"), "utf8"));

const forbiddenPackages = [
  "react",
  "react-dom",
  "roslib",
  "leaflet",
  "react-leaflet",
  "ink",
  "@ardiclabs",
];
const allDependencies = {
  ...(corePackage.dependencies ?? {}),
  ...(corePackage.devDependencies ?? {}),
  ...(corePackage.peerDependencies ?? {}),
  ...(corePackage.optionalDependencies ?? {}),
};
const violations = [];

for (const dependency of Object.keys(allDependencies)) {
  if (forbiddenPackages.some((name) => dependency === name || dependency.startsWith(`${name}/`))) {
    violations.push(`@ggcs/core package dependency is forbidden: ${dependency}`);
  }
}

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

for (const file of walk(path.join(coreDir, "src")).filter((value) => value.endsWith(".ts"))) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file);
  for (const forbidden of forbiddenPackages) {
    const importPattern = new RegExp(`(?:from\\s+|import\\s*\\()?["']${forbidden.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?:/[^"']*)?["']`);
    if (importPattern.test(source)) violations.push(`${relative} imports forbidden package ${forbidden}`);
  }
  for (const browserGlobal of ["window.", "document.", "navigator."]) {
    if (source.includes(browserGlobal)) violations.push(`${relative} references browser global ${browserGlobal.slice(0, -1)}`);
  }
}

if (!corePackage.exports?.["."]) {
  violations.push("@ggcs/core must expose a top-level package export");
}

if (violations.length > 0) {
  for (const violation of violations) console.error(`M01 boundary violation: ${violation}`);
  process.exitCode = 1;
} else {
  console.log("M01 dependency boundaries: PASS");
}
