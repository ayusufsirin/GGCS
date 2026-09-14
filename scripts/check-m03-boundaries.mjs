import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const transformsDir = path.join(root, "packages", "transforms");
const rosStdMsgsDir = path.join(root, "packages", "ros-std-msgs");
const arnavDir = path.join(root, "plugins", "arnav");
const sensorSuiteDir = path.join(root, "packages", "sensor-suite");
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
  "@ggcs/sensor-suite",
  sensorSuiteDir,
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
    "@ggcs/sensor-suite",
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
scan(sensorSuiteDir, {
  forbiddenImports: uiImports,
  forbiddenTokens: ["window.", "document.", "navigator.", "localStorage", "../src/middleware", "../src/config"],
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

const definitionSource = fs.readFileSync(path.join(sensorSuiteDir, "src", "definition.ts"), "utf8");
for (const sideEffectProvider of ["topicCommand"]) {
  if (definitionSource.includes(`ROSBRIDGE_PROVIDER_IDS.${sideEffectProvider}`)) {
    violations.push(`shadow definition references forbidden side-effect provider ${sideEffectProvider}`);
  }
}

for (const [label, directory] of [
  ["@ggcs/transforms", transformsDir],
  ["@ggcs/ros-std-msgs", rosStdMsgsDir],
  ["@ggcs/arnav", arnavDir],
  ["@ggcs/sensor-suite", sensorSuiteDir],
]) {
  if (!readPackage(directory).exports?.["."]) {
    violations.push(`${label} must expose a top-level package export`);
  }
}

// Slice 04 hardware-free production-contract gate: the synthetic ROS interface
// must remain test-only while preserving the exact software contract GGCS consumes.
const contractFixtureDir = path.join(root, "infra", "test", "m03-contract");
const contractComposeSource = fs.readFileSync(path.join(root, "compose.yaml"), "utf8");
const contractFixtureSource = fs.readFileSync(path.join(contractFixtureDir, "fixture.py"), "utf8");
const contractInsMessage = fs.readFileSync(
  path.join(contractFixtureDir, "ardiclabs_arnav_msgs", "msg", "Ins.msg"),
  "utf8",
);
const contractStatusMessage = fs.readFileSync(
  path.join(contractFixtureDir, "ardiclabs_arnav_msgs", "msg", "InsStatus.msg"),
  "utf8",
);

if (!contractComposeSource.includes("m03-contract-ros:")) {
  violations.push("compose.yaml must define the M03 production-contract ROS fixture service");
}
if (!contractComposeSource.includes("ws://m03-contract-ros:9090")) {
  violations.push("M03 production-contract proof must default to the hermetic rosbridge endpoint");
}
if (contractComposeSource.includes("GGCS_M03_ON_TARGET_LEGACY_UI_OBSERVATION")) {
  violations.push("hardware-free M03 contract gate must not require an operator legacy-UI observation");
}
for (const topic of [
  "/ArdicLabs/Arnav/Gnss_Ins_data",
  "/speed",
  "/accel",
  "/arnav/satellites",
]) {
  if (!contractFixtureSource.includes(topic)) {
    violations.push(`M03 production-contract fixture is missing production topic ${topic}`);
  }
}
for (const field of ["roll_rad", "pitch_rad", "yaw_rad", "lat_rad", "lon_rad", "h_m"]) {
  if (!contractInsMessage.includes(`float64 ${field}`)) {
    violations.push(`test-only ArNav interface is missing numeric field ${field}`);
  }
}
for (const field of ["system_ok", "roll_pitch_ok", "yaw_ok", "pos_vel_ok", "mag_ok", "gnss_fixed"]) {
  if (!contractStatusMessage.includes(`bool ${field}`)) {
    violations.push(`test-only ArNav interface is missing status field ${field}`);
  }
}
if (!contractInsMessage.includes("ardiclabs_arnav_msgs/InsStatus status")) {
  violations.push("test-only ArNav interface must preserve nested status object shape");
}


if (violations.length > 0) {
  for (const violation of violations) console.error(`M03 boundary violation: ${violation}`);
  process.exitCode = 1;
} else {
  console.log("M03 Sensor Suite shadow dependency/safety boundaries: PASS");
}
