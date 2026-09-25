import type { JsonValue } from "@ggcs/schema";
import type { WidgetSpec } from "./contracts.js";

export interface WidgetSpecValidationIssue {
  readonly path: string;
  readonly message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNamespacedId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]*:[^\s]+$/i.test(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isRecord(value)) return Object.values(value).every(isJsonValue);
  return false;
}

function validateRecordKeys(
  issues: WidgetSpecValidationIssue[],
  path: string,
  value: unknown,
  validateEntry: (issues: WidgetSpecValidationIssue[], path: string, entry: Record<string, unknown>) => void,
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "must be an object" });
    return;
  }
  for (const [name, rawEntry] of Object.entries(value)) {
    const entryPath = `${path}.${name}`;
    if (!name.length) issues.push({ path: entryPath, message: "port/property name must not be empty" });
    if (!isRecord(rawEntry)) {
      issues.push({ path: entryPath, message: "must be an object" });
      continue;
    }
    validateEntry(issues, entryPath, rawEntry);
  }
}

function validateRequired(issues: WidgetSpecValidationIssue[], path: string, value: unknown): void {
  if (value !== undefined && typeof value !== "boolean") {
    issues.push({ path: `${path}.required`, message: "must be boolean when present" });
  }
}

function validateTypeId(issues: WidgetSpecValidationIssue[], path: string, value: unknown): void {
  if (!isNamespacedId(value)) issues.push({ path, message: "must be a namespaced semantic type ID" });
}

function validateDescription(issues: WidgetSpecValidationIssue[], path: string, value: unknown): void {
  if (value !== undefined && typeof value !== "string") {
    issues.push({ path: `${path}.description`, message: "must be string when present" });
  }
}

function validateKnownKeys(
  issues: WidgetSpecValidationIssue[],
  path: string,
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) issues.push({ path: `${path}.${key}`, message: "is not a supported WidgetSpec field" });
  }
}

export function validateWidgetSpec(value: unknown): readonly WidgetSpecValidationIssue[] {
  const issues: WidgetSpecValidationIssue[] = [];
  if (!isRecord(value)) return [{ path: "$", message: "WidgetSpec must be an object" }];

  validateKnownKeys(issues, "$", value, ["type", "version", "props", "inputs", "actions", "capabilities", "rendererCapabilities"]);
  if (!isNamespacedId(value.type)) issues.push({ path: "$.type", message: "must be a namespaced widget type ID" });
  if (!Number.isInteger(value.version) || (value.version as number) < 1) {
    issues.push({ path: "$.version", message: "must be a positive integer" });
  }

  validateRecordKeys(issues, "$.props", value.props, (out, path, entry) => {
    validateKnownKeys(out, path, entry, ["type", "required", "defaultValue", "description"]);
    validateTypeId(out, `${path}.type`, entry.type);
    validateRequired(out, path, entry.required);
    if (entry.defaultValue !== undefined && !isJsonValue(entry.defaultValue)) {
      out.push({ path: `${path}.defaultValue`, message: "must be portable JSON data" });
    }
    validateDescription(out, path, entry.description);
  });

  validateRecordKeys(issues, "$.inputs", value.inputs, (out, path, entry) => {
    validateKnownKeys(out, path, entry, ["type", "required", "description"]);
    validateTypeId(out, `${path}.type`, entry.type);
    validateRequired(out, path, entry.required);
    validateDescription(out, path, entry.description);
  });

  validateRecordKeys(issues, "$.actions", value.actions, (out, path, entry) => {
    validateKnownKeys(out, path, entry, ["target", "input", "output", "required", "description"]);
    if (entry.target !== "command" && entry.target !== "procedure") {
      out.push({ path: `${path}.target`, message: "must be command or procedure" });
    }
    validateTypeId(out, `${path}.input`, entry.input);
    validateRequired(out, path, entry.required);
    if (entry.target === "command" && entry.output !== undefined) {
      out.push({ path: `${path}.output`, message: "command actions must not declare procedure output" });
    }
    if (entry.target === "procedure" && entry.output === undefined) {
      out.push({ path: `${path}.output`, message: "procedure actions must declare an output type" });
    } else if (entry.output !== undefined) {
      validateTypeId(out, `${path}.output`, entry.output);
    }
    validateDescription(out, path, entry.description);
  });

  validateRecordKeys(issues, "$.capabilities", value.capabilities, (out, path, entry) => {
    validateKnownKeys(out, path, entry, ["capability", "required", "description"]);
    if (!isNamespacedId(entry.capability)) {
      out.push({ path: `${path}.capability`, message: "must be a namespaced capability ID" });
    }
    validateRequired(out, path, entry.required);
    validateDescription(out, path, entry.description);
  });

  if (value.rendererCapabilities !== undefined) {
    if (!Array.isArray(value.rendererCapabilities)) {
      issues.push({ path: "$.rendererCapabilities", message: "must be an array when present" });
    } else {
      const seen = new Set<string>();
      for (const [index, capability] of value.rendererCapabilities.entries()) {
        if (!isNamespacedId(capability)) {
          issues.push({ path: `$.rendererCapabilities[${index}]`, message: "must be a namespaced capability ID" });
        } else if (seen.has(capability)) {
          issues.push({ path: `$.rendererCapabilities[${index}]`, message: "must not duplicate a renderer capability ID" });
        } else {
          seen.add(capability);
        }
      }
    }
  }

  return issues;
}

export function assertValidWidgetSpec(value: unknown): asserts value is WidgetSpec {
  const issues = validateWidgetSpec(value);
  if (!issues.length) return;
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  throw new TypeError(`Invalid WidgetSpec: ${details}`);
}
