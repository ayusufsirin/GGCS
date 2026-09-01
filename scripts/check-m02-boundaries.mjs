import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const transportDir = path.join(root, "packages", "transport-rosbridge");
const packageJson = JSON.parse(fs.readFileSync(path.join(transportDir, "package.json"), "utf8"));
const violations = [];

const allowedRuntimeDependencies = new Set([
  "@ggcs/core",
  "@ggcs/plugin-sdk",
  "@ggcs/schema",
  "roslib",
]);
for (const dependency of Object.keys(packageJson.dependencies ?? {})) {
  if (!allowedRuntimeDependencies.has(dependency)) {
    violations.push(`@ggcs/transport-rosbridge has unexpected runtime dependency: ${dependency}`);
  }
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const forbiddenImports = [
  "react",
  "react-dom",
  "leaflet",
  "react-leaflet",
  "ink",
  "@ardiclabs",
];
const forbiddenGlobals = ["window.", "document.", "navigator.", "localStorage"];
const forbiddenEnv = ["REACT_APP_"];

for (const file of walk(path.join(transportDir, "src")).filter((value) => value.endsWith(".ts"))) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file);
  for (const forbidden of forbiddenImports) {
    const escaped = forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const importPattern = new RegExp(`(?:from\\s+|import\\s*\\()[\"']${escaped}(?:/[^\"']*)?[\"']`);
    if (importPattern.test(source)) violations.push(`${relative} imports forbidden package ${forbidden}`);
  }
  for (const browserGlobal of forbiddenGlobals) {
    if (source.includes(browserGlobal)) violations.push(`${relative} references forbidden browser global ${browserGlobal}`);
  }
  for (const envName of forbiddenEnv) {
    if (source.includes(envName)) violations.push(`${relative} references presentation-specific environment variable ${envName}`);
  }
}

if (!packageJson.exports?.["."]) {
  violations.push("@ggcs/transport-rosbridge must expose a top-level package export");
}

if (violations.length > 0) {
  for (const violation of violations) console.error(`M02 boundary violation: ${violation}`);
  process.exitCode = 1;
} else {
  console.log("M02 ROSBridge dependency boundaries: PASS");
}
