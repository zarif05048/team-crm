// The Pipeline boards (owner, 2026-11-09: "focus on weight loss, minor
// surgery"). Plain data with no server imports, so the board — a client
// component — can use it; lib/data/conversations.ts re-exports it for the
// server side.

/**
 * The tag that puts a thread on the weight-loss board. A database trigger adds
 * it the first time a patient's message mentions weight loss (and starts the
 * thread in "new") — see migration 2026-09-23_weight_loss_pipeline.sql. Staff
 * can also add or remove it by hand from the thread's tag bar.
 */
export const WEIGHT_LOSS_TAG = "weight-loss";
/**
 * The minor-surgery board's tag. Added by a trigger on the first enquiry about
 * a procedure on the TCA list (2026-11-09_minor_surgery_pipeline.sql), and by
 * the bot's book_minor_surgery / the staff "TCA list" button on a booking.
 */
export const MINOR_SURGERY_TAG = "minor-surgery";

/** The boards, in tab order. Same stages, columns and follow-up rules. */
export const PIPELINES = {
  "weight-loss": { tag: WEIGHT_LOSS_TAG, label: "Weight loss", title: "Weight-loss pipeline", removedColumn: "pipeline_removed_at" },
  "minor-surgery": { tag: MINOR_SURGERY_TAG, label: "Minor surgery", title: "Minor-surgery pipeline", removedColumn: "surgery_removed_at" },
} as const;
export type PipelineKey = keyof typeof PIPELINES;
export const isPipelineKey = (s: unknown): s is PipelineKey => typeof s === "string" && s in PIPELINES;
