import { describe, it, expect } from "vitest";
import {
  formatFileSize,
  pluralize,
  truncate,
  formatDuration,
} from "./format";

describe("formatFileSize", () => {
  it("returns 0 B for zero bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.0 GB");
  });
});

describe("pluralize", () => {
  it("returns singular for count 1", () => {
    expect(pluralize(1, "module")).toBe("module");
  });

  it("returns auto-pluralized for count != 1", () => {
    expect(pluralize(0, "module")).toBe("modules");
    expect(pluralize(2, "module")).toBe("modules");
  });

  it("uses custom plural form", () => {
    expect(pluralize(2, "child", "children")).toBe("children");
  });
});

describe("truncate", () => {
  it("returns text unchanged if within limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates with ellipsis", () => {
    expect(truncate("hello world", 6)).toBe("hello…");
  });
});

describe("formatDuration", () => {
  it("formats milliseconds", () => {
    expect(formatDuration(500)).toBe("500ms");
  });

  it("formats seconds", () => {
    expect(formatDuration(5000)).toBe("5s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(90_000)).toBe("1m 30s");
  });

  it("formats hours, minutes, seconds", () => {
    expect(formatDuration(3_661_000)).toBe("1h 1m 1s");
  });

  it("formats days and hours", () => {
    expect(formatDuration(90_000_000)).toBe("1d 1h");
  });
});
