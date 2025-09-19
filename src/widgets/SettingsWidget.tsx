// widgets/SettingsWidget.tsx (example)
import React from "react";
import { useGetParameters, useSetParameters } from "../middleware/roslib/use-rcl-params";
import { paramInteger, paramString } from "../middleware/roslib/types/rcl-params";

export function SettingsWidget() {
  const { call: getParams, pending: getting, data: getData, error: getErr } =
    useGetParameters("getParams");          // matches config key
  const { call: setParams, pending: setting, data: setData, error: setErr } =
    useSetParameters("setParams");          // matches config key

  async function onRead() {
    const res = await getParams({ names: ["auto_mode_timeout", "mode_name"] });
    // res.values is aligned with names[]
    // e.g., res.values[0].integer_value, res.values[1].string_value
    console.log("GetParameters:", res);
  }

  async function onWrite() {
    const req = {
      parameters: [
        paramInteger("auto_mode_timeout", 3),
        paramString("mode_name", "AUTO"),
      ],
    };
    const res = await setParams(req);
    console.log("SetParameters:", res.results);
  }

  return (
    <div>
      <button disabled={getting} onClick={onRead}>
        {getting ? "Reading…" : "Read Params"}
      </button>
      <button disabled={setting} onClick={onWrite} style={{ marginLeft: 8 }}>
        {setting ? "Writing…" : "Write Params"}
      </button>

      {getErr && <div style={{ color: "#e66" }}>Get error: {String(getErr)}</div>}
      {setErr && <div style={{ color: "#e66" }}>Set error: {String(setErr)}</div>}
      {getData && <pre>{JSON.stringify(getData, null, 2)}</pre>}
      {setData && <pre>{JSON.stringify(setData, null, 2)}</pre>}
    </div>
  );
}
