// Generated usernames: lastname_firstname followed by a running number.
//
//   student  delacruz_juan00004   five digits
//   teacher  santos_maria0002     four digits
//
// The number comes from a counter document, counters/usernames, holding the
// last number handed out for each role. It only ever goes up, so deleting a
// user never frees their number for someone else.
//
// The counter did not exist before this, so the first time a role is numbered
// it starts after whichever is higher: how many users of that role there are,
// or the highest number already on a generated username.

import { collection, doc, getDoc, getDocs, runTransaction } from 'firebase/firestore';
import { db } from '$lib/firebase';
import { hasRole } from '$lib/users';

const COUNTER = doc(db, 'counters', 'usernames');

export const USERNAME_DIGITS = { student: 5, teacher: 4 };

/**
 * A name reduced to lowercase letters and digits: accents dropped, spaces and
 * punctuation removed, so "DELA CRUZ" becomes "delacruz" and "PEÑA" "pena".
 * @param {string} name
 */
export function usernamePart(name) {
	return String(name ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

/**
 * @param {'student' | 'teacher'} role
 * @param {string} firstName
 * @param {string} lastName
 * @param {number} number
 */
export function formatUsername(role, firstName, lastName, number) {
	const digits = USERNAME_DIGITS[role] ?? 4;
	return `${usernamePart(lastName)}_${usernamePart(firstName)}${String(number).padStart(digits, '0')}`;
}

/** Where numbering starts for a role that has no counter yet. */
async function startingPoint(role) {
	const digits = USERNAME_DIGITS[role] ?? 4;
	const pattern = new RegExp(`^[a-z0-9]+_[a-z0-9]*?(\\d{${digits}})$`);
	const snapshot = await getDocs(collection(db, 'users'));

	let count = 0;
	let highest = 0;

	for (const d of snapshot.docs) {
		const user = d.data();
		if (!hasRole(user, role)) continue;
		count++;
		const match = typeof user.username === 'string' ? user.username.match(pattern) : null;
		if (match) highest = Math.max(highest, Number(match[1]));
	}

	return Math.max(count, highest);
}

/**
 * The number the next user of this role would get, without taking it. For
 * showing on the form; the number actually used comes from reserveNumber.
 * @param {'student' | 'teacher'} role
 */
export async function peekNextNumber(role) {
	try {
		const snapshot = await getDoc(COUNTER);
		const last = snapshot.exists() ? snapshot.data()[role] : undefined;
		if (typeof last === 'number') return last + 1;
	} catch (error) {
		console.error('Could not read the username counter:', error);
	}
	return (await startingPoint(role)) + 1;
}

/**
 * Take the next number for this role. Done in a transaction, so two people
 * registering at the same moment cannot be handed the same one.
 * @param {'student' | 'teacher'} role
 * @returns {Promise<number>}
 */
export async function reserveNumber(role) {
	// Worked out before the transaction because a transaction cannot run a
	// query. Only used when the counter has no entry for this role yet.
	const snapshot = await getDoc(COUNTER);
	const seeded = snapshot.exists() && typeof snapshot.data()[role] === 'number';
	const start = seeded ? 0 : await startingPoint(role);

	return runTransaction(db, async (tx) => {
		const current = await tx.get(COUNTER);
		const last = current.exists() && typeof current.data()[role] === 'number' ? current.data()[role] : start;
		const next = last + 1;
		tx.set(COUNTER, { [role]: next }, { merge: true });
		return next;
	});
}
