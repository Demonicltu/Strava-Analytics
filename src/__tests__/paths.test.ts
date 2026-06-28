import { describe, it, expect } from "vitest";
import { resolveBaseDir } from "../paths.js";

describe("resolveBaseDir", () => {
  it("falls back to cwd for invalid url", () => {
    expect(resolveBaseDir("not-a-file-url")).toBe(process.cwd());
  });

  it("returns a non-empty base dir for file urls", () => {
    const base = resolveBaseDir(import.meta.url);
    expect(typeof base).toBe("string");
    expect(base.length).toBeGreaterThan(0);
  });
});

