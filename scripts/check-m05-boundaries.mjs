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

// CRA/Jest requires one exact React/React-DOM runtime pair. Without a pnpm lockfile,
// compatible semver ranges can drift independently during Docker dependency install.
const reactVersion = packageJson.dependencies?.react;
const reactDomVersion = packageJson.dependencies?.["react-dom"];
const exactSemver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
if (!reactVersion || reactVersion !== reactDomVersion || !exactSemver.test(reactVersion)) {
  violations.push("Root react and react-dom must use the same exact version for deterministic Web/Jest installs");
}

// M05-S3 generic React renderer/access package boundaries.
const rendererRoot = "packages/renderer-react";
if (!exists(rendererRoot)) {
  violations.push("M05-S3 is missing packages/renderer-react");
} else {
  const rendererPackage = JSON.parse(read(`${rendererRoot}/package.json`));
  if (rendererPackage.name !== "@ggcs/renderer-react") {
    violations.push("M05-S3 React renderer package must be named @ggcs/renderer-react");
  }

  const allowedRendererRuntimeDeps = new Set(["@ggcs/core", "@ggcs/schema", "@ggcs/widgets"]);
  for (const dependency of Object.keys(rendererPackage.dependencies ?? {})) {
    if (!allowedRendererRuntimeDeps.has(dependency)) {
      violations.push(`@ggcs/renderer-react has forbidden runtime dependency ${dependency}`);
    }
  }
  if (!rendererPackage.peerDependencies?.react) {
    violations.push("@ggcs/renderer-react must declare React as a peer dependency");
  }

  const forbiddenRendererImports = [
    "roslib",
    "leaflet",
    "react-leaflet",
    "@ggcs/transport-rosbridge",
    "@ggcs/sensor-suite",
    "@ggcs/arnav",
  ];
  const rendererSourceFiles = walk(path.join(root, rendererRoot, "src")).filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));
  const rendererImportPattern = /(?:from\s+|import\s*\()(["'])([^"']+)\1/g;
  for (const file of rendererSourceFiles) {
    const content = fs.readFileSync(file, "utf8");
    for (const match of content.matchAll(rendererImportPattern)) {
      const specifier = match[2];
      for (const forbidden of forbiddenRendererImports) {
        if (specifier === forbidden || specifier.startsWith(`${forbidden}/`)) {
          violations.push(`@ggcs/renderer-react imports forbidden transport/application dependency ${specifier}: ${path.relative(root, file)}`);
        }
      }
    }
  }

  const rendererContracts = read(`${rendererRoot}/src/contracts.ts`);
  if (!rendererContracts.includes("interface PresentationAccess")) {
    violations.push("@ggcs/renderer-react must expose narrow PresentationAccess");
  }
  if (!rendererContracts.includes("interface ResolvedWidgetAccess")) {
    violations.push("@ggcs/renderer-react must expose ResolvedWidgetAccess");
  }
  const presentationContracts = read("packages/widgets/src/presentation.ts");
  if (!presentationContracts.includes('kind: "tabs"') || !presentationContracts.includes('kind: "grid"') ||
      !presentationContracts.includes('kind: "stack"') || !presentationContracts.includes('kind: "widget"')) {
    violations.push("@ggcs/widgets must model renderer-neutral tabs/grid/stack/widget resolved layout primitives");
  }
  if (!presentationContracts.includes("interface ResolvedPresentation")) {
    violations.push("@ggcs/widgets must expose renderer-neutral ResolvedPresentation");
  }
  if (rendererContracts.includes("readonly runtime:") || rendererContracts.includes("runtime: Runtime")) {
    violations.push("@ggcs/renderer-react renderer contracts must not expose unrestricted Runtime");
  }

  const rendererContext = read(`${rendererRoot}/src/context.tsx`);
  const rendererExternalStore = `${rendererRoot}/src/external-store.ts`;
  if (!exists(rendererExternalStore) || !rendererContext.includes("createCachedExternalStore")) {
    violations.push("@ggcs/renderer-react must cache Source/Invocation snapshots before passing them to React external-store hooks");
  } else {
    const externalStoreSource = read(rendererExternalStore);
    if (!externalStoreSource.includes("getSnapshot(): T") || !externalStoreSource.includes("Object.is(snapshot, next)")) {
      violations.push("@ggcs/renderer-react cached external store must preserve snapshot identity until subscription delivery");
    }
    const externalStoreTest = `${rendererRoot}/test/external-store.test.ts`;
    if (!exists(externalStoreTest) || !read(externalStoreTest).includes("referentially stable")) {
      violations.push("@ggcs/renderer-react must retain regression evidence for unstable current() object identity");
    }
  }
  for (const hook of [
    "useWidgetInputObservation",
    "useWidgetCommand",
    "useWidgetProcedure",
    "useWidgetCapability",
    "useInvocationState",
  ]) {
    if (!rendererContext.includes(hook)) {
      violations.push(`@ggcs/renderer-react is missing semantic access hook ${hook}`);
    }
  }

  const rendererRegistry = read(`${rendererRoot}/src/registry.tsx`);
  if (!rendererRegistry.includes("Duplicate React widget implementation")) {
    violations.push("@ggcs/renderer-react registry must reject duplicate semantic widget implementations");
  }
  if (!rendererRegistry.includes('kind: "unsupported"')) {
    violations.push("@ggcs/renderer-react must provide explicit unsupported widget resolution");
  }

  const rendererSession = read(`${rendererRoot}/src/session.ts`);
  if (rendererSession.includes("Runtime") && !rendererSession.includes("no Runtime")) {
    violations.push("@ggcs/renderer-react session must not own Runtime");
  }
}

if (!packageJson.scripts?.["build:m05:renderer-react"] || !packageJson.scripts?.["test:m05:renderer-react"]) {
  violations.push("M05-S3 React renderer package build/test scripts are missing");
}
for (const requiredStep of ["build:m05:renderer-react", "test:m05:renderer-react"]) {
  if (!verifyM05.includes(requiredStep)) violations.push(`verify:m05 does not include ${requiredStep}`);
}
if (!dockerfile.includes("COPY packages/renderer-react/package.json packages/renderer-react/package.json")) {
  violations.push("Docker dependency stage must copy @ggcs/renderer-react package.json so its dependencies are installed");
}


// M05-S4 reusable semantic React widget implementation package boundaries.
const widgetsReactRoot = "packages/widgets-react";
if (!exists(widgetsReactRoot)) {
  violations.push("M05-S4 is missing packages/widgets-react");
} else {
  const widgetsReactPackage = JSON.parse(read(`${widgetsReactRoot}/package.json`));
  if (widgetsReactPackage.name !== "@ggcs/widgets-react") {
    violations.push("M05-S4 React widget package must be named @ggcs/widgets-react");
  }

  const allowedWidgetsReactRuntimeDeps = new Set(["@ggcs/renderer-react", "@ggcs/widgets"]);
  for (const dependency of Object.keys(widgetsReactPackage.dependencies ?? {})) {
    if (!allowedWidgetsReactRuntimeDeps.has(dependency)) {
      violations.push(`@ggcs/widgets-react has forbidden runtime dependency ${dependency}`);
    }
  }
  if (!widgetsReactPackage.peerDependencies?.react) {
    violations.push("@ggcs/widgets-react must declare React as a peer dependency");
  }
  if (widgetsReactPackage.devDependencies?.react !== reactVersion || widgetsReactPackage.devDependencies?.["react-dom"] !== reactDomVersion) {
    violations.push("@ggcs/widgets-react test React/React-DOM versions must match the exact root Web runtime pair");
  }

  const forbiddenWidgetsReactImports = [
    "roslib",
    "leaflet",
    "react-leaflet",
    "@ggcs/transport-rosbridge",
    "@ggcs/sensor-suite",
    "@ggcs/arnav",
  ];
  const widgetsReactSourceFiles = walk(path.join(root, widgetsReactRoot, "src")).filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));
  const widgetsReactImportPattern = /(?:from\s+|import\s*\()(["'])([^"']+)\1/g;
  for (const file of widgetsReactSourceFiles) {
    const content = fs.readFileSync(file, "utf8");
    for (const token of ["useAttr", "instanceStore", "publisherBus", "serviceBus", "useRuntimeCompatibility"]) {
      if (content.includes(token)) {
        violations.push(`@ggcs/widgets-react retains migration/legacy access token ${token}: ${path.relative(root, file)}`);
      }
    }
    for (const match of content.matchAll(widgetsReactImportPattern)) {
      const specifier = match[2];
      for (const forbidden of forbiddenWidgetsReactImports) {
        if (specifier === forbidden || specifier.startsWith(`${forbidden}/`)) {
          violations.push(`@ggcs/widgets-react imports forbidden transport/application dependency ${specifier}: ${path.relative(root, file)}`);
        }
      }
    }
  }

  const gaugeReact = read(`${widgetsReactRoot}/src/GaugeWidget.tsx`);
  const statusReact = read(`${widgetsReactRoot}/src/StatusWidget.tsx`);
  for (const [name, content] of [["GaugeWidget", gaugeReact], ["StatusWidget", statusReact]]) {
    if (!content.includes("useWidgetInputObservation")) {
      violations.push(`@ggcs/widgets-react ${name} must consume Observation through semantic renderer access`);
    }
    if (!content.includes("useWidgetProps")) {
      violations.push(`@ggcs/widgets-react ${name} must consume semantic WidgetSpec props`);
    }
  }
  const widgetsReactRegistry = read(`${widgetsReactRoot}/src/registry.ts`);
  for (const widgetId of ["STANDARD_WIDGET_IDS.gauge", "STANDARD_WIDGET_IDS.status"]) {
    if (!widgetsReactRegistry.includes(widgetId)) {
      violations.push(`@ggcs/widgets-react registry is missing S4 implementation ${widgetId}`);
    }
  }
  if (!widgetsReactRegistry.includes("ReactWidgetRegistry")) {
    violations.push("@ggcs/widgets-react must integrate through the generic ReactWidgetRegistry");
  }
  const widgetsReactTests = read(`${widgetsReactRoot}/test/widgets.test.tsx`);
  for (const state of ['state: "fresh"', 'state: "stale"', 'state: "unavailable"', 'state: "error"']) {
    if (!widgetsReactTests.includes(state)) {
      violations.push(`@ggcs/widgets-react tests must cover Observation ${state}`);
    }
  }
}

if (!packageJson.scripts?.["build:m05:widgets-react"] || !packageJson.scripts?.["test:m05:widgets-react"]) {
  violations.push("M05-S4 React widget package build/test scripts are missing");
}
for (const requiredStep of ["build:m05:widgets-react", "test:m05:widgets-react"]) {
  if (!verifyM05.includes(requiredStep)) violations.push(`verify:m05 does not include ${requiredStep}`);
}
if (!dockerfile.includes("COPY packages/widgets-react/package.json packages/widgets-react/package.json")) {
  violations.push("Docker dependency stage must copy @ggcs/widgets-react package.json so its dependencies are installed");
}
if (!compose.includes('m05-verify:') || !compose.includes('profiles: ["m05"]')) violations.push("Compose is missing the M05 verification profile");
if (!dockerfile.includes("FROM workspace AS m05-verify")) violations.push("Dockerfile is missing the M05 verification target");
if (!dockerfile.includes("COPY packages/widgets/package.json packages/widgets/package.json")) {
  violations.push("Docker dependency stage must copy @ggcs/widgets package.json so its devDependencies are installed");
}
if (compose.includes("REACT_APP_GGCS_BACKEND_MODE") || read("react.prod.Dockerfile").includes("REACT_APP_GGCS_BACKEND_MODE")) {
  violations.push("Web container configuration still exposes the retired backend mode");
}

// M05-S5 first real Sensor Suite semantic React cutover (Gauge + Status only).
const semanticCutover = read("src/presentation/semantic-widget-cutover.ts");
const semanticFrame = read("src/presentation/SemanticWidgetFrame.tsx");
const bootstrapSource = read("src/bootstrap.tsx");
for (const dependency of ["@ggcs/renderer-react", "@ggcs/widgets", "@ggcs/widgets-react"]) {
  if (packageJson.dependencies?.[dependency] !== "workspace:*") {
    violations.push(`M05-S5 Web app must consume ${dependency} as a workspace dependency`);
  }
}
if (!semanticCutover.includes("createSensorSuiteSemanticPresentationAccess")) {
  violations.push("M05-S5 must adapt selected production widgets through narrow PresentationAccess");
}
if (!semanticCutover.includes("gaugeWidgetSpec") || !semanticCutover.includes("statusWidgetSpec")) {
  violations.push("M05-S5 semantic cutover must use the standard Gauge/Status WidgetSpecs");
}
for (const forbidden of ["/ArdicLabs/", "/zed/", "/bag_recorder/", "ROSLIB", "roslib", "needleColor", "onColor", "offColor", "lucide-react"]) {
  if (semanticCutover.includes(forbidden)) {
    violations.push(`M05-S5 semantic cutover contains forbidden protocol/renderer detail ${forbidden}`);
  }
}
if (!semanticFrame.includes("ReactResolvedWidget") || !semanticFrame.includes("createStandardReactWidgetRegistry")) {
  violations.push("M05-S5 semantic frame must render through the generic React renderer and widgets-react registry");
}
if (!bootstrapSource.includes("resolveSensorSuiteSemanticWidget") || !bootstrapSource.includes("SemanticWidgetFrame")) {
  violations.push("M05-S5 Dashboard must route selected production widgets through the semantic React path");
}
if (!read("packages/renderer-react/src/presentation.tsx").includes("export function ReactResolvedWidget")) {
  violations.push("M05-S5 generic renderer must expose the single resolved-widget primitive used by hybrid strangler integration");
}
for (const legacyWidget of ["MapWidget", "HUDWidget", "ROSParametersWidget", "ServiceWidget", "ImageWidget"]) {
  if (!read("src/widgets/widgets.tsx").includes(legacyWidget)) {
    violations.push(`M05-S5 must preserve non-migrated legacy widget ${legacyWidget} during incremental cutover`);
  }
}

if (violations.length) {
  for (const violation of violations) console.error(`M05 boundary violation: ${violation}`);
  process.exitCode = 1;
} else {
  console.log("M05-S1/S2/S3/S4/S5 legacy removal + semantic widget + React renderer/widget + app cutover boundaries: PASS");
}
