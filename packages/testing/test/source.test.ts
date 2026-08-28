import { describe, expect, it } from "vitest";
import { RuntimeError, createSourceController } from "@ggcs/core";
import { FakeClock } from "../src/index.js";

describe("Source/Observation", () => {
  it("starts unavailable and preserves falsey values", () => {
    const clock = new FakeClock();
    const controller = createSourceController<unknown>({ id: "s", clock });
    expect(controller.source.current().state).toBe("unavailable");

    for (const value of [0, false, "", []] as const) {
      controller.publish(value);
      expect(controller.source.current()).toMatchObject({ state: "fresh", value });
    }
  });

  it("delivers current observation immediately and isolates listener failures", () => {
    const clock = new FakeClock();
    const controller = createSourceController<number>({ id: "s", clock });
    const seen: string[] = [];
    controller.source.subscribe(() => {
      throw new Error("consumer failure");
    });
    const subscription = controller.source.subscribe((value) => seen.push(value.state));
    controller.publish(1);
    subscription.unsubscribe();
    subscription.unsubscribe();
    controller.publish(2);
    expect(seen).toEqual(["unavailable", "fresh"]);
  });

  it("transitions fresh to stale using the monotonic fake clock", () => {
    const clock = new FakeClock(10_000);
    const controller = createSourceController<number>({
      id: "s",
      clock,
      freshness: { staleAfterMs: 500 },
    });
    controller.publish(4.3);
    clock.advanceBy(499);
    expect(controller.source.current().state).toBe("fresh");
    clock.setWallTime(1); // wall-clock adjustment must not alter the duration gate
    clock.advanceBy(1);
    expect(controller.source.current()).toMatchObject({ state: "stale", value: 4.3 });
  });

  it("preserves lastGood on provider error", () => {
    const clock = new FakeClock();
    const controller = createSourceController<number>({ id: "s", clock });
    controller.publish(7);
    controller.fail(
      new RuntimeError({ code: "TEST", category: "resource_error", message: "boom" }),
    );
    expect(controller.source.current()).toMatchObject({
      state: "error",
      lastGood: { state: "fresh", value: 7 },
    });
  });

  it("preserves deterministic update order and rearms freshness from the newest value", () => {
    const clock = new FakeClock();
    const controller = createSourceController<number>({
      id: "ordered",
      clock,
      freshness: { staleAfterMs: 50 },
    });
    const seen: Array<[string, number | undefined]> = [];
    controller.source.subscribe((observation) => {
      seen.push([
        observation.state,
        observation.state === "fresh" || observation.state === "stale"
          ? observation.value
          : undefined,
      ]);
    });

    controller.publish(1);
    clock.advanceBy(40);
    controller.publish(2);
    clock.advanceBy(10); // the cancelled timer for value 1 must not stale value 2
    expect(controller.source.current()).toMatchObject({ state: "fresh", value: 2 });
    clock.advanceBy(40);
    expect(controller.source.current()).toMatchObject({ state: "stale", value: 2 });
    expect(seen).toEqual([
      ["unavailable", undefined],
      ["fresh", 1],
      ["fresh", 2],
      ["stale", 2],
    ]);
  });

});
