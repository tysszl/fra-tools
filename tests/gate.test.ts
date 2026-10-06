// Access codes: which code opens which page.
import { describe, expect, test } from "bun:test";
import { GATES, gateHash, gateMatches, gateUnlock } from "../shared/gate.js";

describe("access gates", () => {
  test("hashes are the djb2 of the trimmed, lowercased code", () => {
    expect(gateHash("")).toBe("1505");
    expect(gateMatches("team", "  FRATEAM26 ")).toBe(gateHash("frateam26") === GATES.team.hash);
  });

  test("only the team code opens; the retired C+ code and wrong codes open nothing", () => {
    expect(gateUnlock(["team"], "FRATEAM26")).toEqual({ name: "team", code: "frateam26" });
    expect(gateUnlock(["team"], "CPLUS26")).toBeNull();
    expect(gateUnlock(["team"], "nope")).toBeNull();
  });
});
