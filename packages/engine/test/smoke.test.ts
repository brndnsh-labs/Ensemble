import assert from "node:assert/strict";
import { test } from "node:test";
import { hello } from "@ensemble/engine";

test("smoke", () => {
  assert.equal(hello(1), 2);
});
