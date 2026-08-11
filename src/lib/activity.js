// Working out who is actually active.
//
// The dashboard used to display Math.floor(totalUsers * 0.3) under the label
// "Active Users" — a guess presented as a measurement. These helpers derive the
// figure from real timestamps instead, and are shared so the overview and the
// analytics page can never disagree.
//
// Two sources feed it:
//   users/{uid}.lastSeenAt          written by the app when it is opened
//   readingProgress.lastReadAt      written when reading progress is saved
//
// The second is the fallback for anyone who read before the app started
// recording lastSeenAt.

export const ACTIVE_NOW_MINUTES = 15;

/** Firestore Timestamp, Date or ISO string to Date. */
export function toDate(value) {
	if (!value) return null;
	if (typeof value.toDate === 'function') return value.toDate();
	const d = new Date(value);
	return isNaN(d.getTime()) ? null : d;
}

/**
 * Most recent activity per user, whichever source it came from.
 * @returns {Map<string, Date>}
 */
export function latestActivityByUser(users = [], progress = []) {
	const latest = new Map();

	const consider = (userId, date) => {
		if (!userId || !date) return;
		const previous = latest.get(userId);
		if (!previous || date > previous) latest.set(userId, date);
	};

	for (const user of users) consider(user.id, toDate(user.lastSeenAt));
	for (const record of progress) consider(record.userId, toDate(record.lastReadAt));

	return latest;
}

export function countActiveSince(latest, since) {
	let count = 0;
	for (const date of latest.values()) {
		if (date >= since) count++;
	}
	return count;
}

export function startOfToday() {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d;
}

export function minutesAgo(minutes) {
	return new Date(Date.now() - minutes * 60000);
}

export function daysAgo(days) {
	const d = startOfToday();
	d.setDate(d.getDate() - days);
	return d;
}
