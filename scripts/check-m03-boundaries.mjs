import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const transformsDir = path.join(root, "packages", "transforms");
const arnavDir = path.join(root, "plugins", "arnav");
const shadowDir = path.join(root, "apps", "examples", "sensor-suite-shadow-headless");
const violations = [];

function readPackage(directory) {
  return JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
}

function runtimeDependencies(directory) {
  return Object.keys(readPackage(directory).dependencies ?? {});
}

function requireAllowedDependencies(label, directory, allowed) {
  for (const dependency of runtimeDependencies(directory)) {
    if (!allowed.has(dependency)) {
      violations.push(`${label} has unexpected runtime dependency: ${dependency}`);
    }
  }
}

requireAllowedDependencies(
  "@ggcs/transforms",
  transformsDir,
  new Set(["@ggcs/plugin-sdk", "@ggcs/schema"]),
);
requireAllowedDependencies(
  "@ggcs/arnav",
  arnavDir,
  new Set(["@ggcs/plugin-sdk", "@ggcs/ros", "@ggcs/schema"]),
);
requireAllowedDependencies(
  "sensor-suite-shadow-headless",
  shadowDir,
  new Set([
    "@ggcs/arnav",
    "@ggcs/core",
    "@ggcs/ros",
    "@ggcs/schema",
    "@ggcs/transforms",
    "@ggcs/transport-rosbridge",
  ]),
);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function scan(directory, options) {
  for (const file of walk(path.join(directory, "src")).filter((value) => value.endsWith(".ts"))) {
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(root, file);
    for (const forbidden of options.forbiddenImports) {
      const escaped = forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const importPattern = new RegExp(`(?:from\\s+|import\\s*\\()["']${escaped}(?:/[^"']*)?["']`);
      if (importPattern.test(source)) violations.push(`${relative} imports forbidden package ${forbidden}`);
    }
    for (const token of options.forbiddenTokens ?? []) {
      if (source.includes(token)) violations.push(`${relative} contains forbidden token ${token}`);
    }
  }
}

const uiImports = ["react", "react-dom", "leaflet", "react-leaflet", "ink"];
scan(transformsDir, {
  forbiddenImports: ["@ggcs/ros", "@ggcs/transport-rosbridge", "@ggcs/arnav", "roslib", ...uiImports],
  forbiddenTokens: ["window.", "document.", "navigator.", "/ArdicLabs/Arnav/Gnss_Ins_data"],
});
scan(arnavDir, {
  forbiddenImports: ["@ggcs/transport-rosbridge", "roslib", ...uiImports],
  forbiddenTokens: ["window.", "document.", "navigator.", "/ArdicLabs/Arnav/Gnss_Ins_data"],
});
scan(shadowDir, {
  forbiddenImports: uiImports,
  forbiddenTokens: ["window.", "document.", "navigator.", "localStorage", "../src/middleware", "../src/config"],
});

const definitionSource = fs.readFileSync(path.join(shadowDir, "src", "definition.ts"), "utf8");
for (const sideEffectProvider of ["topicCommand", "serviceProcedure", "parameterProvider"]) {
  if (definitionSource.includes(`ROSBRIDGE_PROVIDER_IDS.${sideEffectProvider}`)) {
    violations.push(`shadow definition references forbidden side-effect provider ${sideEffectProvider}`);
  }
}

for (const [label, directory] of [
  ["@ggcs/transforms", transformsDir],
  ["@ggcs/arnav", arnavDir],
]) {
  if (!readPackage(directory).exports?.["."]) {
    violations.push(`${label} must expose a top-level package export`);
  }
}

if (violations.length > 0) {
  for (const violation of violations) console.error(`M03 boundary violation: ${violation}`);
  process.exitCode = 1;
} else {
  console.log("M03 Sensor Suite shadow dependency/safety boundaries: PASS");
}
