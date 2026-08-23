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
