import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const violations = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const packageJson = JSON.parse(read("packages/sensor-suite/package.json"));
const sensorDefinition = read("packages/sensor-suite/src/definition.ts");
const exampleDefinition = read("apps/examples/sensor-suite-shadow-headless/src/definition.ts");
const backendMode = read("src/runtime/backend-mode.ts");
const compatibilityMap = read("src/runtime/compatibility-map.ts");
const application = read("src/runtime/sensor-suite-application.ts");
const index = read("src/index.tsx");
const dashboard = read("src/bootstrap.tsx");
const attachBindings = read("src/middleware/attach-bindings.ts");
const telemetryCutover = read("src/runtime/telemetry-cutover.ts");
const useAttr = read("src/middleware/hooks/use-attr.ts");
const useService = read("src/middleware/hooks/use-service.ts");
const usePublisher = read("src/middleware/hooks/use-publisher.ts");
const rosConn = read("src/middleware/roslib/ros-conn.ts");

for (const dependency of ["react", "react-dom", "roslib"]) {
  if (packageJson.dependencies?.[dependency]) {
    violations.push(`@ggcs/sensor-suite must not depend on ${dependency}`);
  }
}
for (const token of ["window.", "document.", "navigator.", "localStorage"]) {
  if (sensorDefinition.includes(token)) {
    violations.push(`@ggcs/sensor-suite definition contains browser token ${token}`);
  }
}
if (!exampleDefinition.includes('export * from "@ggcs/sensor-suite"')) {
  violations.push("M03 Sensor Suite example must re-export the canonical @ggcs/sensor-suite composition");
}

if (!backendMode.includes('return "legacy"')) {
  violations.push("M04 backend mode must default to legacy");
}
for (const mode of ["legacy", "shadow", "compat-read", "compat-full"]) {
  if (!backendMode.includes(`"${mode}"`)) violations.push(`M04 backend vocabulary is missing ${mode}`);
}
if (!backendMode.includes("assertM04Slice3ModeSupported")) {
  violations.push("M04-S3 must explicitly gate unsupported compatibility modes");
}
if (!backendMode.includes('if (mode === "compat-full")')) {
  violations.push("M04-S3 must keep compat-full fail-closed while enabling compat-read");
}

for (const forbidden of [
  "ROSLIB",
  "roslib",
  "/ArdicLabs/Arnav/Gnss_Ins_data",
  '"/speed"',
  '"/accel"',
  "/rosapi/",
  "/zed/",
  "/bag_recorder/",
]) {
  if (compatibilityMap.includes(forbidden)) {
    violations.push(`compatibility map contains transport/protocol detail ${forbidden}`);
  }
}
if (!compatibilityMap.includes("SENSOR_SUITE_RESOURCE_IDS")) {
  violations.push("compatibility map must bind legacy ports to semantic Sensor Suite resource IDs");
}
if (!compatibilityMap.includes("parameterProvider(SENSOR_SUITE_RESOURCE_IDS.parameters)")) {
  violations.push("ROSParametersWidget migration capability must target ParameterProvider");
}

for (const forbidden of [
  "instance-store",
  "publisher-bus",
  "service-bus",
  "attach-bindings",
  "roslib",
  "ROSLIB",
]) {
  if (application.includes(forbidden)) {
    violations.push(`new Web application controller imports/references legacy transport state: ${forbidden}`);
  }
}
if (!application.includes("compileSensorSuiteApplication")) {
  violations.push("Web application controller must create the accepted Sensor Suite Runtime composition");
}
if (!application.includes("runtime ??=")) {
  violations.push("Web application controller must create at most one Runtime instance");
}

if (!index.includes("await application.start()")) {
  violations.push("browser application shell must start the Runtime before mounting React");
}
if (!index.includes("root.unmount()") || !index.includes("application.stop()")) {
  violations.push("browser application shell must detach React before stopping the Runtime");
}
if (!index.includes("mode !== 'shadow'")) {
  violations.push("shadow Runtime startup failure must not take down the authoritative legacy UI");
}

// S3 makes every explicitly mapped low-bandwidth Source port authoritative in
// compat-read. The legacy binding shell stays in place for rollback and later
// action slices, while its subscriber ownership is filtered down to unmapped
// exceptions (currently the camera).
if (!dashboard.includes("useAttachAllBindings(config)")) {
  violations.push("M04-S3 must retain the compatibility binding shell for rollback and later action slices");
}
if (!attachBindings.includes("filterLegacySubscriberBindingsForMode")) {
  violations.push("M04-S3 must filter migrated telemetry out of the legacy subscriber binder");
}
for (const legacyBinder of ["attachServiceBindings", "attachConstantBindings", "attachPublisherBindings"]) {
  if (!attachBindings.includes(legacyBinder)) {
    violations.push(`M04-S3 must leave non-telemetry legacy binding path intact: ${legacyBinder}`);
  }
}
if (!telemetryCutover.includes("isM04Slice3RuntimeReadPort")) {
  violations.push("M04-S3 legacy subscriber filtering must use the explicit semantic compatibility map");
}
if (!useAttr.includes("instanceStore")) {
  violations.push("M04-S3 must retain legacy instanceStore for rollback/unmapped camera reads");
}
if (!useAttr.includes("useRuntimeCompatibility") || !useAttr.includes("resourceForPort") || !useAttr.includes(".subscribe(")) {
  violations.push("M04-S3 useAttr must project semantic Runtime Source observations");
}
for (const forbidden of ["ROSLIB", "roslib", "new ROSLIB.Topic", "/ArdicLabs/"]) {
  if (useAttr.includes(forbidden)) {
    violations.push(`M04-S3 useAttr must not create/discover transport state: ${forbidden}`);
  }
}
if (!compatibilityMap.includes("isM04Slice3RuntimeReadPort") ||
    !compatibilityMap.includes('?.kind === "source"')) {
  violations.push("M04-S3 must derive Runtime telemetry authority from explicit semantic Source bindings");
}
if (compatibilityMap.includes("cameraZedRgbRaw")) {
  violations.push("M04-S3 must not silently cut over camera before its compatibility Source is proven");
}
if (!useService.includes("serviceBus")) {
  violations.push("M04-S3 unexpectedly cut over services before S4");
}
if (!usePublisher.includes("publisherBus")) {
  violations.push("M04-S3 unexpectedly cut over publishers");
}
if (!rosConn.includes("resolveRosbridgeUrl")) {
  violations.push("legacy ROSLIB and new Runtime must share Web endpoint selection semantics");
}

if (violations.length > 0) {
  for (const violation of violations) console.error(`M04 boundary violation: ${violation}`);
  process.exitCode = 1;
} else {
  console.log("M04 React compatibility/runtime cutover boundaries: PASS");
}
