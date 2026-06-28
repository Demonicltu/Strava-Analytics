import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const closeMock = vi.fn();
  const questionMock = vi.fn();
  const createInterfaceMock = vi.fn(() => ({
    question: questionMock,
    close: closeMock,
  }));
  return { closeMock, questionMock, createInterfaceMock };
});

vi.mock("node:readline", () => ({
  createInterface: mocks.createInterfaceMock,
}));

import { prompt } from "../cli_utils.js";

describe("prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates readline interface and returns trimmed answer", async () => {
    mocks.questionMock.mockImplementation((_q: string, cb: (a: string) => void) => cb("  hello  "));
    const out = await prompt("Name: ");
    expect(mocks.createInterfaceMock).toHaveBeenCalledTimes(1);
    expect(mocks.questionMock).toHaveBeenCalledWith("Name: ", expect.any(Function));
    expect(mocks.closeMock).toHaveBeenCalledTimes(1);
    expect(out).toBe("hello");
  });

  it("handles empty answer", async () => {
    mocks.questionMock.mockImplementation((_q: string, cb: (a: string) => void) => cb("   "));
    const out = await prompt("Empty: ");
    expect(out).toBe("");
    expect(mocks.closeMock).toHaveBeenCalledTimes(1);
  });
});



