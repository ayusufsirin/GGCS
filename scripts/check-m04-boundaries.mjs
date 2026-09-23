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
const actionCutover = read("src/runtime/action-cutover.ts");
const parameterCutover = read("src/runtime/parameter-cutover.ts");
const useAttr = read("src/middleware/hooks/use-attr.ts");
const useService = read("src/middleware/hooks/use-service.ts");
const usePublisher = read("src/middleware/hooks/use-publisher.ts");
const useParameters = read("src/middleware/hooks/use-parameters.ts");
const rosParametersWidget = read("src/widgets/ROSParametersWidget.tsx");
const compatFullClosureTest = read("src/runtime/compat-full-closure.test.ts");
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
if (!backendMode.includes("assertM04Slice6ModeSupported")) {
  violations.push("M04-S6 must explicitly enable the accepted compatibility mode vocabulary");
}
if (!backendMode.includes("backendUsesLegacyBindings")) {
  violations.push("M04-S6 must explicitly separate accepted compat-full from legacy binding ownership");
}
if (!backendMode.includes('return mode !== "compat-full"')) {
  violations.push("M04-S6 compat-full must disable the legacy binding shell");
}
if (!backendMode.includes('mode === "compat-read" || mode === "compat-full"')) {
  violations.push("M04-S6 must keep Runtime-backed compatibility enabled in compat-read/full");
}
if (!backendMode.includes("backendUsesRuntimeForParameters")) {
  violations.push("M04-S6 must retain ParameterProvider authority by backend mode");
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
if (!application.includes('options.mode === "compat-full"') || !application.includes("includeCamera: true")) {
  violations.push("M04-S6 compat-full must enable the active camera compatibility Source");
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

// S6 enables compat-full without deleting rollback infrastructure. The
// Dashboard mounts the legacy binding bridge only outside compat-full.
if (!dashboard.includes("LegacyBindingsBridge") ||
    !dashboard.includes("backendUsesLegacyBindings(mode)") ||
    !dashboard.includes("useAttachAllBindings(config)")) {
  violations.push("M04-S6 must retain legacy binders only behind the explicit rollback bridge");
}
if (!attachBindings.includes("if (!backendUsesLegacyBindings(mode)) return () => undefined")) {
  violations.push("M04-S6 compat-full must skip legacy binding collection/attachment entirely");
}
if (!attachBindings.includes("filterLegacySubscriberBindingsForMode")) {
  violations.push("M04-S4 must retain S3 telemetry filtering");
}
if (!attachBindings.includes("filterLegacyServiceBindingsForMode")) {
  violations.push("M04-S5 must retain recording Procedure filtering");
}
if (!attachBindings.includes("filterLegacyParameterServiceBindingsForMode")) {
  violations.push("M04-S5 must remove legacy parameter services when ParameterProvider is authoritative");
}
for (const legacyBinder of ["attachSubscriberBindings", "attachServiceBindings", "attachConstantBindings", "attachPublisherBindings"]) {
  if (!attachBindings.includes(legacyBinder)) {
    violations.push(`M04-S6 must retain rollback-only legacy binder implementation: ${legacyBinder}`);
  }
}
if (!telemetryCutover.includes("isM04Slice3RuntimeReadPort")) {
  violations.push("M04-S3 legacy subscriber filtering must use the explicit semantic compatibility map");
}
if (!useAttr.includes("instanceStore")) {
  violations.push("M04-S6 must retain legacy instanceStore only for rollback/compat-read camera behavior");
}
if (!useAttr.includes("isM04Slice6RuntimeReadPort") || !useAttr.includes("fullModeUnmapped")) {
  violations.push("M04-S6 useAttr must route all compat-full reads through explicit Runtime Source mappings and fail closed otherwise");
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
if (!compatibilityMap.includes("cameraZedRgbData") ||
    !compatibilityMap.includes("isM04Slice6RuntimeReadPort")) {
  violations.push("M04-S6 must map the active camera port to its proven derived compatibility Source");
}
if (!sensorDefinition.includes("cameraZedRgbData") ||
    !sensorDefinition.includes("compressedImageData") ||
    !sensorDefinition.includes("defineValueTransform")) {
  violations.push("M04-S6 Sensor Suite composition must provide the derived compressed-image data compatibility Source");
}
if (!actionCutover.includes("isM04Slice4RuntimeProcedurePort") ||
    !actionCutover.includes("backendUsesRuntimeForActions")) {
  violations.push("M04-S4 legacy service filtering must use explicit Procedure bindings and backend policy");
}
if (!compatibilityMap.includes("isM04Slice4RuntimeProcedurePort") ||
    !compatibilityMap.includes('?.kind === "procedure"')) {
  violations.push("M04-S4 must derive action authority from explicit semantic Procedure bindings");
}
if (!useService.includes("useRuntimeCompatibility") ||
    !useService.includes("resourceForPort") ||
    !useService.includes(".invoke(req).result()")) {
  violations.push("M04-S4 useServiceCall must invoke semantic Runtime Procedures");
}
if (!useService.includes("serviceBus")) {
  violations.push("M04-S6 must retain serviceBus only for explicit rollback modes");
}
if (!useService.includes("fullModeUnmapped") || !useService.includes("compat-full has no Runtime Procedure mapping")) {
  violations.push("M04-S6 compat-full service hooks must fail closed rather than use serviceBus");
}
for (const forbidden of ["ROSLIB", "new ROSLIB.Service", "/zed/", "/bag_recorder/"]) {
  if (useService.includes(forbidden)) {
    violations.push(`M04-S4 useServiceCall must not create/discover transport state: ${forbidden}`);
  }
}
if (!parameterCutover.includes("isM04Slice5LegacyParameterServicePort") ||
    !parameterCutover.includes("backendUsesRuntimeForParameters")) {
  violations.push("M04-S5 parameter service filtering must use explicit parameter ports and backend policy");
}
if (!compatibilityMap.includes("isM04Slice5RuntimeParameterCapability") ||
    !compatibilityMap.includes('?.kind === "parameterProvider"')) {
  violations.push("M04-S5 must derive ParameterProvider authority from the explicit semantic capability binding");
}
if (!useParameters.includes("resourceForCapability") ||
    !useParameters.includes(".list(") ||
    !useParameters.includes(".resolve<string>(") ||
    !useParameters.includes(".refresh().result()") ||
    !useParameters.includes(".write(value).result()")) {
  violations.push("M04-S5 parameter browser compatibility must use ParameterProvider/Parameter semantics");
}
if (!useParameters.includes("serviceBus")) {
  violations.push("M04-S6 parameter browser must retain explicit legacy rollback through serviceBus");
}
for (const forbidden of ["/rosapi/", "rosapi/GetParam", "rosapi/SetParam"]) {
  if (useParameters.includes(forbidden)) {
    violations.push(`M04-S5 parameter hook must not know rosapi service names/types: ${forbidden}`);
  }
}
for (const forbidden of ["useServiceCall", "/rosapi/", "getParamNames", "setParamSvc", "getParamSvc"]) {
  if (rosParametersWidget.includes(forbidden)) {
    violations.push(`ROSParametersWidget must use semantic parameter access rather than rosapi/service hooks: ${forbidden}`);
  }
}
if (!usePublisher.includes("publisherBus")) {
  violations.push("M04-S6 must retain publisherBus for legacy rollback");
}
if (!usePublisher.includes('runtimeCompatibility.mode === "compat-full"') ||
    !usePublisher.includes("compat-full has no Runtime Command mapping")) {
  violations.push("M04-S6 compat-full publisher hook must fail closed without touching publisherBus");
}
if (!compatFullClosureTest.includes("collectPublisherBindings(config)") ||
    !compatFullClosureTest.includes("collectConstantBindings(config)") ||
    !compatFullClosureTest.includes("isM04Slice6RuntimeReadPort")) {
  violations.push("M04-S6 must prove the active config has no publisher/constant dependency and all subscriber ports have Runtime authority");
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
