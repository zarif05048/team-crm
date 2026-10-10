// Run with: node --experimental-strip-types scripts/test-pipeline-follow-up.mjs
import assert from "node:assert/strict";
import { malaysiaDate, validCalendarDate, pipelineWarning, unansweredFollowUps } from "../src/lib/pipeline-follow-up.ts";

const qualified = {
  stage: "qualified", bookingDate: null,
  qualifiedSince: "2026-09-20T02:00:00Z",
  followUpAt: "2026-09-27T02:00:00Z",
  lastInboundAt: "2026-09-26T02:00:00Z",
};
assert.equal(pipelineWarning(qualified, "2026-10-03"), null, "No warning on day six");
assert.ok(pipelineWarning(qualified, "2026-10-04"), "Warning on day seven");
assert.equal(pipelineWarning({ ...qualified, lastInboundAt: "2026-09-27T03:00:00Z" }, "2026-10-04"), null,
  "A reply after follow-up clears the warning, regardless of which line received it");
assert.ok(pipelineWarning({ ...qualified, followUpAt: null, lastInboundAt: "2026-09-19T00:00:00Z" }, "2026-10-04"), "Unfollowed Qualified cards age from stage entry");
assert.equal(pipelineWarning({ ...qualified, followUpAt: null, lastInboundAt: "2026-09-21T00:00:00Z" }, "2026-10-04"), null);
assert.equal(pipelineWarning({ ...qualified, followUpAt: "2026-10-04T03:00:00Z" }, "2026-10-04"), null,
  "Another follow-up resets the wait");

const booking = { ...qualified, stage: "booking", bookingDate: "2026-09-27" };
assert.equal(pipelineWarning(booking, "2026-10-03"), null);
assert.ok(pipelineWarning(booking, "2026-10-04"));
assert.ok(pipelineWarning({ ...booking, lastInboundAt: "2026-10-04T00:00:00Z" }, "2026-10-04"),
  "Booking stays yellow while still in Booking even after a reply");
assert.equal(pipelineWarning({ ...booking, bookingDate: null }, "2026-10-04"), null);
assert.equal(pipelineWarning({ ...booking, bookingDate: "2026-10-10" }, "2026-10-04"), null);
for (const stage of ["new", "contacted", "won", "lost"]) {
  assert.equal(pipelineWarning({ ...booking, stage }, "2026-10-04"), null);
}

// Not Respond sweep (owner, 2026-10-10): exactly the yellow Follow Up cards, per patient.
const t = (id, contactId, extra = {}) => ({ id, contactId, stageEnteredAt: "2026-09-20T03:00:00Z",
  followUpAt: "2026-09-27T03:00:00Z", lastInboundAt: null, ...extra });
assert.deepEqual(unansweredFollowUps([t("a", "p1")], "2026-10-03"), [], "Day six: stays in Follow Up");
assert.deepEqual(unansweredFollowUps([t("a", "p1")], "2026-10-04"), ["a"], "Day seven, no reply: moves");
assert.deepEqual(unansweredFollowUps([t("a", "p1", { lastInboundAt: "2026-09-28T00:00:00Z" })], "2026-10-04"), [],
  "A reply after the follow-up keeps the card in Follow Up");
assert.deepEqual(unansweredFollowUps([t("a", "p1"), t("b", "p1"), t("c", "p2", { followUpAt: "2026-10-01T03:00:00Z" })], "2026-10-04"), ["a", "b"],
  "Both of one patient's threads move together; a recent follow-up stays");
assert.deepEqual(unansweredFollowUps([t("a", "p1", { followUpAt: null, stageEnteredAt: "2026-09-28T03:00:00Z" })], "2026-10-04"), [],
  "No recorded follow-up: ages from entering Follow Up");
assert.deepEqual(unansweredFollowUps([], "2026-10-04"), []);

assert.equal(malaysiaDate("2026-10-03T16:00:00Z"), "2026-10-04", "Malaysia midnight, not UTC midnight");
assert.equal(malaysiaDate("2026-10-03T15:59:59Z"), "2026-10-03");
assert.equal(pipelineWarning({ ...qualified, followUpAt: "2026-09-27T16:00:00Z" }, "2026-10-04"), null,
  "UTC date must not highlight one day early");
assert.equal(validCalendarDate("2026-02-29"), false);
assert.equal(validCalendarDate("2028-02-29"), true);
assert.equal(validCalendarDate("2026-04-31"), false);
assert.equal(validCalendarDate("04/10/2026"), false);
assert.equal(validCalendarDate(null), false);
console.log("Pipeline checks passed: seven-day boundaries, replies, stage exits, repeated follow-up, Malaysia midnight, date validation and the Not Respond sweep.");
