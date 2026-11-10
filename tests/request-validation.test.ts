import { describe, expect, it } from "vitest";
import {
  validateCreationId,
  validatePageMaxTokens,
} from "../extensions/client/request-validation.js";

describe("Hindsight creation IDs", () => {
  it.each([
    "",
    "team/notes",
    "bad\u0000id",
    "bad\nname",
    "bad\u0085id",
    "a".repeat(193),
    "界".repeat(65),
  ])("rejects unsupported IDs: %j", (id) => {
    expect(() => validateCreationId(id, "Bank")).toThrow();
    expect(() => validateCreationId(id, "Mental model")).toThrow();
  });

  it.each(["Team Notes", "MyModel", "team_notes", "a".repeat(192), "界".repeat(64)])(
    "accepts URL-safe IDs within the UTF-8 byte limit: %j",
    (id) => {
      expect(() => validateCreationId(id, "Bank")).not.toThrow();
      expect(() => validateCreationId(id, "Mental model")).not.toThrow();
    },
  );

  it("reserves leading underscores for banks only", () => {
    expect(() => validateCreationId("_internal", "Bank")).toThrow("must not start");
    expect(() => validateCreationId("_model", "Mental model")).not.toThrow();
  });
});

describe("knowledge-page and mental-model token budgets", () => {
  it.each([undefined, 256, 4096, 8192])("accepts omitted and valid budgets: %j", (value) => {
    expect(() => validatePageMaxTokens(value)).not.toThrow();
  });

  it.each([0, 255, 8193, 256.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects unsupported budgets: %j",
    (value) => {
      expect(() => validatePageMaxTokens(value)).toThrow("integer between 256 and 8192");
    },
  );
});
