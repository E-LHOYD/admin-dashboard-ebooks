import { collection, getDocs } from 'firebase/firestore';

// The fixed set of subject labels a book can carry. A book may have several.
//
// This is now managed dynamically through the admin dashboard subjects page.
// The constant is kept for backwards compatibility and as a default fallback.
export const DEFAULT_SUBJECTS = [
	'Math',
	'Science',
	'Filipino',
	'Business',
	'Computer',
	'Physical Education',
	'Health',
	'English',
	'Arts',
	'Music',
	'Literature'
];

// Default subjects export for backwards compatibility
export const SUBJECTS = DEFAULT_SUBJECTS;

/**
 * Every subject in the Firestore `subjects` collection, sorted by name.
 *
 * No status filter is applied: every subject document is returned, so a
 * subject added on the Subjects page shows up everywhere subjects are listed.
 * Falls back to DEFAULT_SUBJECTS only when the collection is empty or fails.
 * @param {import('firebase/firestore').Firestore} db
 * @returns {Promise<string[]>}
 */
export async function loadAllSubjects(db) {
	try {
		const snap = await getDocs(collection(db, 'subjects'));
		const names = [
			...new Set(
				snap.docs
					.map((d) => d.data()?.name)
					.filter((n) => typeof n === 'string' && n.trim())
					.map((n) => n.trim())
			)
		].sort((a, b) => a.localeCompare(b));
		return names.length ? names : DEFAULT_SUBJECTS;
	} catch (error) {
		console.error('Error loading subjects:', error);
		return DEFAULT_SUBJECTS;
	}
}

/**
 * The subjects a book carries, tolerating the older single-string field.
 *
 * Books written before this change stored one `subject` string, occasionally
 * comma separated, so that is split rather than treated as a single label.
 * @param {any} book
 * @returns {string[]}
 */
export function bookSubjects(book) {
	if (Array.isArray(book?.subjects)) {
		return book.subjects.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim());
	}

	if (typeof book?.subject === 'string' && book.subject.trim()) {
		return book.subject
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}

	return [];
}

/**
 * Comma separated subjects for display in a table cell or a search haystack.
 * @param {any} book
 * @returns {string}
 */
export function subjectsLabel(book) {
	return bookSubjects(book).join(', ');
}

/**
 * True if the book carries the given subject.
 * @param {any} book
 * @param {string} subject
 * @returns {boolean}
 */
export function hasSubject(book, subject) {
	return bookSubjects(book).includes(subject);
}
