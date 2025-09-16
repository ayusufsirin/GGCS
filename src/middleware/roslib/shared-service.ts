// middleware/roslib/shared-service.ts
import ROSLIB from "roslib";
import { getRos } from "./ros-conn";

export type ServiceId = { name: string; type: string };

const skey = (s: ServiceId) => `${s.name}|${s.type}`;

class ServiceClientRegistry {
  private ros = getRos();
  private services = new Map<string, ROSLIB.Service>();

  private ensure(s: ServiceId): ROSLIB.Service {
    const k = skey(s);
    let svc = this.services.get(k);
    if (!svc) {
      svc = new ROSLIB.Service({
        ros: this.ros,
        name: s.name,
        serviceType: s.type,
      });
      this.services.set(k, svc);
    }
    return svc;
  }

  call<TReq extends object = any, TRes = any>(
    s: ServiceId,
    request: TReq,
    opts?: { timeoutMs?: number }
  ): Promise<TRes> {
    const svc = this.ensure(s);
    const req = new ROSLIB.ServiceRequest(request as any);
    const timeoutMs = opts?.timeoutMs ?? 10000;

    return new Promise<TRes>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Service timeout: ${s.name}`)), timeoutMs);
      svc.callService(
        req,
        (resp: any) => {
          clearTimeout(timer);
          resolve(resp as TRes);
        },
        (err: any) => {
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      );
    });
  }
}

export const sharedServices = new ServiceClientRegistry();
