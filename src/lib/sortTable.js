// Sorting for the dashboard's tables.
//
// The tables show a mix of plain fields, computed labels (a book's subjects,
// a user's full name) and values that only apply to some rows (a strand for a
// senior high student, a department for a teacher). So a column is sorted by
// the value it displays rather than by a document field: each page hands over
// an accessor, and what you see in the cell is what you sort by.

/** A cell with nothing worth ordering by. */
function isBlank(value) {
	return value === null || value === undefined || value === '' || value === '-';
}

/**
 * Compare two cell values.
 *
 * Numbers sort numerically and everything else as text, case-insensitively,
 * with digits inside a string compared by value so "Grade 2" comes before
 * "Grade 10".
 *
 * @param {any} a
 * @param {any} b
 * @returns {number}
 */
export function compareValues(a, b) {
	if (typeof a === 'number' && typeof b === 'number') return a - b;

	return String(a).localeCompare(String(b), undefined, {
		sensitivity: 'base',
		numeric: true
	});
}

/**
 * A sorted copy of the rows. The input is never mutated, so the unsorted order
 * a filter produced is still there to fall back on.
 *
 * Blank cells sort last in both directions. A column of mostly empty cells is
 * useless if ascending buries every real value beneath them, and flipping to
 * descending should not simply move the emptiness to the top instead.
 *
 * @param {any[]} rows
 * @param {(row: any) => any} accessor
 * @param {'asc'|'desc'} direction
 * @returns {any[]}
 */
export function sortRows(rows, accessor, direction = 'asc') {
	if (!Array.isArray(rows) || typeof accessor !== 'function') return rows ?? [];

	const sign = direction === 'desc' ? -1 : 1;

	return [...rows].sort((a, b) => {
		const av = accessor(a);
		const bv = accessor(b);

		const aBlank = isBlank(av);
		const bBlank = isBlank(bv);

		if (aBlank && bBlank) return 0;
		if (aBlank) return 1;
		if (bBlank) return -1;

		return compareValues(av, bv) * sign;
	});
}

/** The arrow shown in a column header. */
export function sortIndicator(key, sortKey, direction) {
	if (key !== sortKey) return '';
	return direction === 'desc' ? ' ▼' : ' ▲';
}

/** aria-sort for a column header, so the state is announced, not just drawn. */
export function ariaSort(key, sortKey, direction) {
	if (key !== sortKey) return 'none';
	return direction === 'desc' ? 'descending' : 'ascending';
}
