import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const apiRouteUrl = new URL("../routes/api.js", import.meta.url);

test("booking APIs require a registered approved provider and a matching service schedule", async () => {
  const source = await readFile(apiRouteUrl, "utf8");

  assert.match(source, /router\.post\("\/requests", allowRoles\("CUSTOMER"\), validate\(schemas\.request\)/);
  assert.match(source, /SELECT p\.verification_status, u\.status, u\.is_sample, s\.provider_id/);
  assert.match(source, /assert\(!provider\.rows\[0\]\.is_sample, 409, "Sample providers are not accepting booking requests\."/);
  assert.match(source, /verification_status === "APPROVED" && provider\.rows\[0\]\.status === "ACTIVE"/);
  assert.match(source, /s\.duration_minutes=a\.appointment_minutes/);
  assert.match(source, /JOIN users u ON u\.id=p\.user_id AND u\.status='ACTIVE' AND NOT u\.is_sample/);
});
