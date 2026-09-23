import React from "react";
import { render } from "@testing-library/react";
import { Dashboard } from "./bootstrap";

jest.mock("./config", () => ({ config: {} }));

describe("M05 Dashboard shell", () => {
  test("renders without mounting any legacy binding bridge", () => {
    expect(() => render(<Dashboard />)).not.toThrow();
  });
});
