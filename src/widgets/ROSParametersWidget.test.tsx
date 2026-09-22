import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ROSParametersWidget } from "./ROSParametersWidget";
import { useParameterBrowser } from "../middleware/hooks/use-parameters";

jest.mock("../middleware/hooks/use-parameters", () => ({
  useParameterBrowser: jest.fn(),
}));

const mockedUseParameterBrowser = useParameterBrowser as jest.MockedFunction<typeof useParameterBrowser>;

describe("M04-S5 ROSParametersWidget compatibility", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  test("preserves the local default baseline while reads/writes use semantic parameter access", async () => {
    const write = jest.fn(async () => undefined);
    mockedUseParameterBrowser.mockReturnValue({
      listNodes: jest.fn(async () => ["/node"]),
      listParameterIds: jest.fn(async () => ["/node:param"]),
      read: jest.fn(async () => "10"),
      write,
    });

    render(<ROSParametersWidget />);
    await screen.findByRole("option", { name: "/node" });

    fireEvent.click(screen.getByRole("button", { name: "Load Params" }));
    await screen.findByText("/node:param");

    expect(screen.getAllByText("10", { selector: "td" })).toHaveLength(2);
    expect(localStorage.getItem("paramDefaults")).toBe(JSON.stringify({ "/node:param": "10" }));

    const input = screen.getByDisplayValue("10");
    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await act(async () => undefined);
    expect(write).toHaveBeenCalledWith("/node:param", "20");
    expect(localStorage.getItem("paramDefaults")).toBe(JSON.stringify({ "/node:param": "10" }));
  });
});
