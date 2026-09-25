import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const violations = [];
const exists = (relative) => fs.existsSync(path.join(root, relative));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const deletedLegacyPaths = [
  "src/runtime/backend-mode.ts",
  "src/runtime/telemetry-cutover.ts",
  "src/runtime/action-cutover.ts",
  "src/runtime/parameter-cutover.ts",
  "src/middleware/attach-bindings.ts",
  "src/middleware/config-scan.ts",
  "src/middleware/instance-store.ts",
  "src/middleware/publisher-bus.ts",
  "src/middleware/service-bus.ts",
  "src/middleware/binders",
  "src/middleware/roslib",
];
for (const relative of deletedLegacyPaths) {
  if (exists(relative)) violations.push(`M05-S1 legacy path still exists: ${relative}`);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const appFiles = walk(path.join(root, "src"))
  .filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));
const forbiddenRuntimeTokens = [
  "instanceStore",
  "publisherBus",
  "serviceBus",
  "collectBindings",
  "useAttachAllBindings",
  "sharedTopics",
  "sharedServices",
  "REACT_APP_GGCS_BACKEND_MODE",
  "./runtime/backend-mode",
  "../runtime/backend-mode",
];
for (const file of appFiles) {
  const content = fs.readFileSync(file, "utf8");
  for (const token of forbiddenRuntimeTokens) {
    if (content.includes(token)) {
      violations.push(`M05-S1 application source retains ${token}: ${path.relative(root, file)}`);
    }
  }
}

const packageJson = JSON.parse(read("package.json"));
if (packageJson.dependencies?.roslib) violations.push("root Web package still depends directly on roslib");
if (packageJson.devDependencies?.["@types/roslib"]) violations.push("root Web package still depends directly on @types/roslib");
const transportPackage = JSON.parse(read("packages/transport-rosbridge/package.json"));
if (!transportPackage.dependencies?.roslib) violations.push("transport-rosbridge must remain the ROSLIB transport owner");

const application = read("src/runtime/sensor-suite-application.ts");
if (!application.includes("includeCamera: true")) violations.push("M05-S1 Web Runtime must retain the accepted camera path");
if (application.includes("SensorSuiteBackendMode") || application.includes("backendStartsRuntime")) {
  violations.push("M05-S1 Web application must not retain rollback backend-mode ownership");
}
const index = read("src/index.tsx");
if (!index.includes("await application.start()")) violations.push("Web application must start Runtime before React mount");
if (index.includes("mode !== 'shadow'") || index.includes("parseSensorSuiteBackendMode")) violations.push("Web entrypoint still contains rollback/shadow fallback semantics");

const useAttr = read("src/middleware/hooks/use-attr.ts");
const useService = read("src/middleware/hooks/use-service.ts");
const useParameters = read("src/middleware/hooks/use-parameters.ts");
const usePublisher = read("src/middleware/hooks/use-publisher.ts");
for (const [name, content] of [["useAttr", useAttr], ["useService", useService], ["useParameters", useParameters], ["usePublisher", usePublisher]]) {
  for (const token of ["instance-store", "service-bus", "publisher-bus", "ROSLIB", "roslib"]) {
    if (content.includes(token)) violations.push(`${name} retains legacy transport/store dependency ${token}`);
  }
  if (!content.includes("useRuntimeCompatibility")) violations.push(`${name} must remain Runtime-backed during extraction`);
}

const map = read("src/runtime/compatibility-map.ts");
for (const token of ["ROSLIB", "roslib", "/rosapi/", "/ArdicLabs/", "/zed/", "/bag_recorder/"]) {
  if (map.includes(token)) violations.push(`compatibility map contains transport/protocol detail ${token}`);
}

// M05-S2 renderer-neutral semantic widget package boundaries.
const widgetsRoot = "packages/widgets";
if (!exists(widgetsRoot)) {
  violations.push("M05-S2 is missing packages/widgets");
} else {
  const widgetsPackage = JSON.parse(read(`${widgetsRoot}/package.json`));
  if (widgetsPackage.name !== "@ggcs/widgets") violations.push("M05-S2 semantic widget package must be named @ggcs/widgets");

  const allowedWidgetRuntimeDeps = new Set(["@ggcs/schema"]);
  for (const dependency of Object.keys(widgetsPackage.dependencies ?? {})) {
    if (!allowedWidgetRuntimeDeps.has(dependency)) {
      violations.push(`@ggcs/widgets has forbidden runtime dependency ${dependency}`);
    }
  }

  const forbiddenWidgetImports = [
    "react",
    "react-dom",
    "leaflet",
    "react-leaflet",
    "roslib",
    "ink",
    "@ggcs/core",
    "@ggcs/transport-rosbridge",
    "@ggcs/sensor-suite",
    "@ggcs/arnav",
  ];
  const widgetSourceFiles = walk(path.join(root, widgetsRoot, "src")).filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));
  const importPattern = /(?:from\s+|import\s*\()(["'])([^"']+)\1/g;
  for (const file of widgetSourceFiles) {
    const content = fs.readFileSync(file, "utf8");
    for (const match of content.matchAll(importPattern)) {
      const specifier = match[2];
      for (const forbidden of forbiddenWidgetImports) {
        if (specifier === forbidden || specifier.startsWith(`${forbidden}/`)) {
          violations.push(`@ggcs/widgets imports forbidden implementation/application dependency ${specifier}: ${path.relative(root, file)}`);
        }
      }
    }
  }

  const widgetSpecs = read(`${widgetsRoot}/src/specs.ts`);
  for (const widgetId of [
    "ggcs:gauge",
    "ggcs:status",
    "ggcs:attitude",
    "ggcs:navigation-map",
    "ggcs:procedure-action",
    "ggcs:image",
    "ggcs:parameter-browser",
    "ggcs:actuator",
  ]) {
    if (!read(`${widgetsRoot}/src/contracts.ts`).includes(widgetId)) {
      violations.push(`@ggcs/widgets is missing standard semantic widget ID ${widgetId}`);
    }
  }
  if (!widgetSpecs.includes("WIDGET_CAPABILITY_IDS.parameterProvider")) {
    violations.push("parameter browser must consume a renderer-neutral ParameterProvider capability");
  }
  if (widgetSpecs.includes("needleColor") || widgetSpecs.includes("onColor") || widgetSpecs.includes("offColor")) {
    violations.push("@ggcs/widgets semantic specs contain renderer-specific color/needle properties");
  }
  if (!read(`${widgetsRoot}/src/value-models.ts`).includes("ImageFrame")) {
    violations.push("@ggcs/widgets must define renderer-neutral ImageFrame semantics");
  }
}

if (!packageJson.scripts?.["build:m05:widgets"] || !packageJson.scripts?.["test:m05:widgets"]) {
  violations.push("M05-S2 widget package build/test scripts are missing");
}
const verifyM05 = packageJson.scripts?.["verify:m05"] ?? "";
for (const requiredStep of ["build:m05:widgets", "test:m05:widgets"]) {
  if (!verifyM05.includes(requiredStep)) violations.push(`verify:m05 does not include ${requiredStep}`);
}

const compose = read("compose.yaml");
const dockerfile = read("Dockerfile");
if (!compose.includes('m05-verify:') || !compose.includes('profiles: ["m05"]')) violations.push("Compose is missing the M05 verification profile");
if (!dockerfile.includes("FROM workspace AS m05-verify")) violations.push("Dockerfile is missing the M05 verification target");
if (compose.includes("REACT_APP_GGCS_BACKEND_MODE") || read("react.prod.Dockerfile").includes("REACT_APP_GGCS_BACKEND_MODE")) {
  violations.push("Web container configuration still exposes the retired backend mode");
}

if (violations.length) {
  for (const violation of violations) console.error(`M05 boundary violation: ${violation}`);
  process.exitCode = 1;
} else {
  console.log("M05-S1/S2 legacy removal + semantic widget boundaries: PASS");
}
