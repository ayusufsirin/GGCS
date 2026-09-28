import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Parameter, ParameterProvider } from "@ggcs/core";
import type { ParameterDescriptor } from "@ggcs/schema";
import { useWidgetCapability, useWidgetProps } from "@ggcs/renderer-react";
import { useParameterBaselineStore } from "./parameter-baseline.js";

type Row = {
  readonly descriptor: ParameterDescriptor<unknown>;
  readonly parameter: Parameter<unknown>;
  readonly baselineValue: string;
  readonly currentValue: string;
  readonly editValue: string;
  readonly readError?: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function parameterGroupForId(id: string): string | undefined {
  const separator = id.indexOf(":");
  return separator > 0 ? id.slice(0, separator) : undefined;
}

export function formatParameterValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try {
    const encoded = JSON.stringify(value);
    return encoded ?? String(value);
  } catch {
    return String(value);
  }
}

export function parseParameterValue(
  descriptor: ParameterDescriptor<unknown>,
  text: string,
): unknown {
  const schemaType = descriptor.type.schema.type;
  if (schemaType === "string") return text;
  if (schemaType === "boolean") {
    if (text === "true") return true;
    if (text === "false") return false;
    throw new Error("Expected true or false");
  }
  if (schemaType === "number" || schemaType === "integer") {
    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error("Expected a finite number");
    if (schemaType === "integer" && !Number.isInteger(value)) throw new Error("Expected an integer");
    return value;
  }
  if (schemaType === "object" || schemaType === "array") {
    return JSON.parse(text);
  }
  return text;
}

function styles() {
  return {
    root: {
      display: "flex",
      flexDirection: "column",
      gap: 10,
      height: "100%",
      padding: 10,
      overflow: "hidden",
    } as React.CSSProperties,
    toolbar: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      alignItems: "center",
    } as React.CSSProperties,
    tableWrap: {
      position: "relative",
      flex: 1,
      overflow: "auto",
    } as React.CSSProperties,
    table: {
      width: "100%",
      borderCollapse: "collapse",
    } as React.CSSProperties,
    th: {
      border: "1px solid #ccc",
      padding: 10,
      textAlign: "left",
      background: "#f7f7f7",
    } as React.CSSProperties,
    td: {
      border: "1px solid #ccc",
      padding: 10,
      textAlign: "left",
    } as React.CSSProperties,
  };
}

export function ParameterBrowserWidget() {
  const props = useWidgetProps() as unknown as { readonly title?: string; readonly allowWrite?: boolean };
  const provider = useWidgetCapability<ParameterProvider>("parameters");
  const baselineStore = useParameterBaselineStore();
  const [descriptors, setDescriptors] = useState<readonly ParameterDescriptor<unknown>[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<readonly Row[]>([]);
  const [loadingDescriptors, setLoadingDescriptors] = useState(false);
  const [loadingValues, setLoadingValues] = useState(false);
  const [saving, setSaving] = useState<Readonly<Record<string, boolean>>>({});
  const [error, setError] = useState<string | undefined>(undefined);
  const [saveErrors, setSaveErrors] = useState<Readonly<Record<string, string>>>({});
  const [showModifiedOnly, setShowModifiedOnly] = useState(false);
  const allowWrite = props.allowWrite !== false;
  const css = useMemo(styles, []);

  const groups = useMemo(() => Array.from(new Set(
    descriptors.map((descriptor) => parameterGroupForId(descriptor.id)).filter((value): value is string => Boolean(value)),
  )).sort(), [descriptors]);

  const loadDescriptors = useCallback(async () => {
    if (!provider) return;
    setLoadingDescriptors(true);
    setError(undefined);
    try {
      const listed = await provider.list();
      setDescriptors([...listed].sort((a, b) => a.id.localeCompare(b.id)));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoadingDescriptors(false);
    }
  }, [provider]);

  useEffect(() => {
    void loadDescriptors();
  }, [loadDescriptors]);

  const loadValues = useCallback(async () => {
    if (!provider) return;
    setLoadingValues(true);
    setError(undefined);
    try {
      const selected = selectedGroup
        ? await provider.list({ prefix: `${selectedGroup}:` })
        : await provider.list();
      const baselines = baselineStore?.load() ?? {};
      let baselineChanged = false;
      const nextRows = await Promise.all(selected.map(async (descriptor): Promise<Row> => {
        const parameter = await provider.resolve(descriptor.id);
        try {
          const value = await parameter.refresh().result();
          const currentValue = formatParameterValue(value);
          const baselineValue = baselines[descriptor.id] ?? currentValue;
          if (baselines[descriptor.id] === undefined) {
            baselines[descriptor.id] = currentValue;
            baselineChanged = true;
          }
          return { descriptor, parameter, baselineValue, currentValue, editValue: currentValue };
        } catch (cause) {
          const baselineValue = baselines[descriptor.id] ?? "";
          return {
            descriptor,
            parameter,
            baselineValue,
            currentValue: "",
            editValue: "",
            readError: errorMessage(cause),
          };
        }
      }));
      if (baselineChanged) baselineStore?.save(baselines);
      setRows(nextRows);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoadingValues(false);
    }
  }, [baselineStore, provider, selectedGroup]);

  const save = useCallback(async (row: Row) => {
    if (!allowWrite || !row.descriptor.writable) return;
    setSaving((state) => ({ ...state, [row.descriptor.id]: true }));
    setSaveErrors((state) => {
      const { [row.descriptor.id]: _drop, ...rest } = state;
      return rest;
    });
    try {
      const value = parseParameterValue(row.descriptor, row.editValue);
      await row.parameter.write(value).result();
      setRows((state) => state.map((item) => item.descriptor.id === row.descriptor.id
        ? { ...item, currentValue: formatParameterValue(value) }
        : item));
    } catch (cause) {
      setSaveErrors((state) => ({ ...state, [row.descriptor.id]: errorMessage(cause) }));
    } finally {
      setSaving((state) => {
        const { [row.descriptor.id]: _drop, ...rest } = state;
        return rest;
      });
    }
  }, [allowWrite]);

  const visibleRows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return rows.filter((row) => {
      const modified = row.editValue !== row.baselineValue;
      if (showModifiedOnly && !modified) return false;
      if (!needle) return true;
      return row.descriptor.id.toLowerCase().includes(needle)
        || row.descriptor.description?.toLowerCase().includes(needle) === true;
    });
  }, [filter, rows, showModifiedOnly]);

  if (!provider) {
    return (
      <div data-ggcs-widget="parameter-browser" data-capability-state="unavailable" style={css.root}>
        <strong>{props.title ?? "Parameters"}</strong>
        <span>Parameter provider unavailable</span>
      </div>
    );
  }

  return (
    <div data-ggcs-widget="parameter-browser" data-capability-state="available" style={css.root}>
      <strong>{props.title ?? "Parameters"}</strong>
      <div style={css.toolbar}>
        <label htmlFor="ggcs-parameter-group">Group/Node:</label>
        <select
          id="ggcs-parameter-group"
          value={selectedGroup}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setSelectedGroup(event.target.value)}
          style={{ minWidth: 220 }}
        >
          <option value="">All Parameters</option>
          {groups.map((group) => <option value={group} key={group}>{group}</option>)}
        </select>
        <button disabled={loadingDescriptors} onClick={() => void loadDescriptors()}>
          {loadingDescriptors ? "Loading…" : "Refresh Groups"}
        </button>
        <button disabled={loadingValues} onClick={() => void loadValues()}>
          {loadingValues ? "Loading…" : "Load Parameters"}
        </button>
        <button onClick={() => baselineStore?.clear()} disabled={!baselineStore}>Clear Baseline</button>
        <input
          aria-label="Filter parameters"
          placeholder="Filter parameters"
          value={filter}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setFilter(event.target.value)}
        />
        <label style={{ marginLeft: "auto" }}>
          <input
            type="checkbox"
            checked={showModifiedOnly}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setShowModifiedOnly(event.target.checked)}
          />{" "}
          Show Modified Only
        </label>
      </div>

      {error && <div role="alert">Error: {error}</div>}

      <div style={css.tableWrap}>
        <table style={css.table}>
          <thead>
            <tr>
              <th style={css.th}>Parameter</th>
              <th style={css.th}>Baseline</th>
              <th style={css.th}>Current</th>
              <th style={css.th}>Edit</th>
              <th style={css.th}>Modified</th>
              <th style={css.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const id = row.descriptor.id;
              const modified = row.editValue !== row.baselineValue;
              const writable = allowWrite && row.descriptor.writable;
              return (
                <tr key={id} data-modified={modified ? "true" : "false"}>
                  <td style={css.td}>
                    <code>{id}</code>
                    {row.descriptor.description && <div>{row.descriptor.description}</div>}
                  </td>
                  <td style={css.td}>{row.baselineValue}</td>
                  <td style={css.td}>{row.readError ? `Error: ${row.readError}` : row.currentValue}</td>
                  <td style={css.td}>
                    <input
                      aria-label={`Edit ${id}`}
                      type="text"
                      disabled={!writable}
                      value={row.editValue}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                        const value = event.target.value;
                        setRows((state) => state.map((item) => item.descriptor.id === id
                          ? { ...item, editValue: value }
                          : item));
                      }}
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />
                  </td>
                  <td style={css.td}>{modified ? "Yes" : "No"}</td>
                  <td style={css.td}>
                    <button disabled={!writable || saving[id]} onClick={() => void save(row)}>
                      {saving[id] ? "Saving…" : "Save"}
                    </button>
                    {saveErrors[id] && <div role="alert">{saveErrors[id]}</div>}
                  </td>
                </tr>
              );
            })}
            {!loadingValues && visibleRows.length === 0 && (
              <tr><td colSpan={6} style={{ ...css.td, textAlign: "center" }}>No parameters to display</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
