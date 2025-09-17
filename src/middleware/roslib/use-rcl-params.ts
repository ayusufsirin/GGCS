// middleware/roslib/use-rcl-params.ts
import { useServiceCall } from "../hooks/use-service";
import type {
  GetParametersRequest,
  GetParametersResponse,
  SetParametersRequest,
  SetParametersResponse,
} from "./types/rcl-params";

export function useGetParameters(attrName: string) {
  return useServiceCall<GetParametersRequest, GetParametersResponse>(attrName);
}

export function useSetParameters(attrName: string) {
  return useServiceCall<SetParametersRequest, SetParametersResponse>(attrName);
}
