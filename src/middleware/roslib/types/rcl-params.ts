// middleware/roslib/types/rcl-params.ts

// ---- ParameterType enum (ROS 2) ----
export const PARAMETER_NOT_SET = 0;
export const PARAMETER_BOOL = 1;
export const PARAMETER_INTEGER = 2;
export const PARAMETER_DOUBLE = 3;
export const PARAMETER_STRING = 4;
export const PARAMETER_BYTE_ARRAY = 5;
export const PARAMETER_BOOL_ARRAY = 6;
export const PARAMETER_INTEGER_ARRAY = 7;
export const PARAMETER_DOUBLE_ARRAY = 8;
export const PARAMETER_STRING_ARRAY = 9;

// ---- rcl_interfaces/msg/ParameterValue ----
export type ParameterValue = {
  type: number; // one of the PARAMETER_* constants above
  bool_value?: boolean;
  integer_value?: number;     // int64 (stick to JS safe integers)
  double_value?: number;
  string_value?: string;
  byte_array_value?: number[];
  bool_array_value?: boolean[];
  integer_array_value?: number[];
  double_array_value?: number[];
  string_array_value?: string[];
};

// ---- rcl_interfaces/msg/Parameter ----
export type Parameter = {
  name: string;
  value: ParameterValue;
};

// ---- rcl_interfaces/srv/GetParameters ----
export type GetParametersRequest = {
  names: string[];
};
export type GetParametersResponse = {
  values: ParameterValue[]; // aligned 1:1 with request.names
};

// ---- rcl_interfaces/srv/SetParameters ----
export type SetParametersRequest = {
  parameters: Parameter[];
};
export type SetParametersResult = {
  successful: boolean;
  reason: string;
};
export type SetParametersResponse = {
  results: SetParametersResult[];
};

// ---- Builders to make SetParametersRequest easy ----
export const paramBool = (name: string, v: boolean): Parameter => ({
  name,
  value: {type: PARAMETER_BOOL, bool_value: v},
});
export const paramInteger = (name: string, v: number): Parameter => ({
  name,
  value: {type: PARAMETER_INTEGER, integer_value: v},
});
export const paramDouble = (name: string, v: number): Parameter => ({
  name,
  value: {type: PARAMETER_DOUBLE, double_value: v},
});
export const paramString = (name: string, v: string): Parameter => ({
  name,
  value: {type: PARAMETER_STRING, string_value: v},
});
export const paramBoolArray = (name: string, v: boolean[]): Parameter => ({
  name,
  value: {type: PARAMETER_BOOL_ARRAY, bool_array_value: v},
});
export const paramIntegerArray = (name: string, v: number[]): Parameter => ({
  name,
  value: {type: PARAMETER_INTEGER_ARRAY, integer_array_value: v},
});
export const paramDoubleArray = (name: string, v: number[]): Parameter => ({
  name,
  value: {type: PARAMETER_DOUBLE_ARRAY, double_array_value: v},
});
export const paramStringArray = (name: string, v: string[]): Parameter => ({
  name,
  value: {type: PARAMETER_STRING_ARRAY, string_array_value: v},
});
