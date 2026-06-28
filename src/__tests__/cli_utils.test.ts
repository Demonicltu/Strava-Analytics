import { describe, it, expect } from "vitest";
import { parseNumberSelection, parsePagedSelection } from "../cli_utils.js";

describe("parseNumberSelection", () => {
  it("returns 1-based number when valid", () => {
    expect(parseNumberSelection("1", 5)).toBe(1);
    expect(parseNumberSelection("5", 5)).toBe(5);
  });

  it("returns null for invalid numeric range", () => {
    expect(parseNumberSelection("0", 5)).toBeNull();
    expect(parseNumberSelection("6", 5)).toBeNull();
    expect(parseNumberSelection("-1", 5)).toBeNull();
  });

  it("returns null for non-numeric values", () => {
    expect(parseNumberSelection("abc", 5)).toBeNull();
    expect(parseNumberSelection("", 5)).toBeNull();
  });
});

describe("parsePagedSelection", () => {
  it("parses quit and navigation commands", () => {
    expect(parsePagedSelection("q", 3)).toEqual({ action: "quit" });
    expect(parsePagedSelection("n", 3)).toEqual({ action: "next" });
    expect(parsePagedSelection("next", 3)).toEqual({ action: "next" });
    expect(parsePagedSelection("p", 3)).toEqual({ action: "prev" });
    expect(parsePagedSelection("prev", 3)).toEqual({ action: "prev" });
    expect(parsePagedSelection("previous", 3)).toEqual({ action: "prev" });
  });

  it("parses numeric selection to zero-based index", () => {
    expect(parsePagedSelection("1", 3)).toEqual({ action: "pick", index: 0 });
    expect(parsePagedSelection("3", 3)).toEqual({ action: "pick", index: 2 });
  });

  it("returns invalid for out-of-range and unknown inputs", () => {
    expect(parsePagedSelection("0", 3)).toEqual({ action: "invalid" });
    expect(parsePagedSelection("4", 3)).toEqual({ action: "invalid" });
    expect(parsePagedSelection("hello", 3)).toEqual({ action: "invalid" });
  });
});
