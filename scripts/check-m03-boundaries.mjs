import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const transformsDir = path.join(root, "packages", "transforms");
const rosStdMsgsDir = path.join(root, "packages", "ros-std-msgs");
const arnavDir = path.join(root, "plugins", "arnav");
const shadowDir = path.join(root, "apps", "examples", "sensor-suite-shadow-headless");
const liveProofDir = path.join(root, "apps", "examples", "sensor-suite-shadow-live-proof");
const onTargetProofDir = path.join(root, "apps", "examples", "sensor-suite-shadow-on-target-proof");
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
  "@ggcs/ros-std-msgs",
  rosStdMsgsDir,
  new Set(["@ggcs/plugin-sdk", "@ggcs/ros", "@ggcs/schema"]),
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
    "@ggcs/ros-std-msgs",
    "@ggcs/schema",
    "@ggcs/transforms",
    "@ggcs/transport-rosbridge",
  ]),
);
requireAllowedDependencies(
  "sensor-suite-shadow-live-proof",
  liveProofDir,
  new Set([
    "@ggcs/core",
    "@ggcs/ros",
    "@ggcs/ros-std-msgs",
    "@ggcs/schema",
    "@ggcs/transport-rosbridge",
    "roslib",
  ]),
);
requireAllowedDependencies(
  "sensor-suite-shadow-on-target-proof",
  onTargetProofDir,
  new Set([
    "@ggcs/arnav",
    "@ggcs/core",
    "@ggcs/example-sensor-suite-shadow-headless",
    "@ggcs/ros",
    "@ggcs/transport-rosbridge",
    "roslib",
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
scan(rosStdMsgsDir, {
  forbiddenImports: ["@ggcs/transport-rosbridge", "roslib", ...uiImports],
  forbiddenTokens: ["window.", "document.", "navigator.", "/speed", "/accel", "/arnav/satellites"],
});
scan(arnavDir, {
  forbiddenImports: ["@ggcs/transport-rosbridge", "roslib", ...uiImports],
  forbiddenTokens: ["window.", "document.", "navigator.", "/ArdicLabs/Arnav/Gnss_Ins_data"],
});
scan(shadowDir, {
  forbiddenImports: uiImports,
  forbiddenTokens: ["window.", "document.", "navigator.", "localStorage", "../src/middleware", "../src/config"],
});
scan(liveProofDir, {
  forbiddenImports: uiImports,
  forbiddenTokens: [
    "window.",
    "document.",
    "navigator.",
    "localStorage",
    "../src/middleware",
    "../src/config",
    "/rosapi/set_param",
    ".write(",
  ],
});
scan(onTargetProofDir, {
  forbiddenImports: uiImports,
  forbiddenTokens: [
    "window.",
    "document.",
    "navigator.",
    "localStorage",
    "../src/middleware",
    "../src/config",
    "/rosapi/set_param",
    ".invoke(",
    ".write(",
  ],
});

for (const file of walk(path.join(liveProofDir, "src")).filter((value) => value.endsWith(".ts"))) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file);
  if (source.includes('from "roslib"') && !relative.endsWith("legacy-reference.ts")) {
    violations.push(`${relative} imports roslib outside the integration-only legacy reference module`);
  }
}
for (const file of walk(path.join(onTargetProofDir, "src")).filter((value) => value.endsWith(".ts"))) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file);
  if (source.includes('from "roslib"') && !relative.endsWith("legacy-reference.ts")) {
    violations.push(`${relative} imports roslib outside the on-target legacy reference module`);
  }
}

const liveDefinitionSource = fs.readFileSync(path.join(liveProofDir, "src", "definition.ts"), "utf8");
for (const sideEffectProvider of ["topicCommand", "serviceProcedure"]) {
  if (liveDefinitionSource.includes(`ROSBRIDGE_PROVIDER_IDS.${sideEffectProvider}`)) {
    violations.push(`live proof definition references forbidden side-effect provider ${sideEffectProvider}`);
  }
}

const definitionSource = fs.readFileSync(path.join(shadowDir, "src", "definition.ts"), "utf8");
for (const sideEffectProvider of ["topicCommand"]) {
  if (definitionSource.includes(`ROSBRIDGE_PROVIDER_IDS.${sideEffectProvider}`)) {
    violations.push(`shadow definition references forbidden side-effect provider ${sideEffectProvider}`);
  }
}

for (const [label, directory] of [
  ["@ggcs/transforms", transformsDir],
  ["@ggcs/ros-std-msgs", rosStdMsgsDir],
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
