/**
 * How often a screen quietly re-checks the server.
 *
 * WHY THIS EXISTS
 * ---------------
 * A change made by ONE user cannot reach another user's browser on its own:
 * invalidateCache() only wakes views inside the same tab. Two staff looking at
 * the same queue — an Admin rescheduling a request while Super Admin watches
 * the Overdue tab — only converge when the second screen polls again. The
 * interval is therefore the real answer to "how stale can this be?", and it
 * was previously a loose number written out at forty-odd call sites.
 *
 * Two tiers, because the cost is not free: every active tab issues one request
 * per interval per hook, and this runs on shared hosting.
 *
 * Polling pauses while the tab is hidden and fires once on return, so an idle
 * tab in the background costs nothing (see useCachedFetch).
 */

/**
 * Queues two roles act on at the same time — service requests, inspections,
 * alerts, account lists. Here a stale row is not just old, it is misleading:
 * it invites someone to act on a request another person already handled.
 */
export const LIVE_POLL_MS = 15000

/**
 * Dashboards, maps and reference lists. These summarise rather than drive
 * action, and nobody decides anything on a ten-second-old farm count — so they
 * stay slow and keep the request volume down.
 */
export const BACKGROUND_POLL_MS = 60000
