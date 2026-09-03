<script>
  import { auth, db } from '$lib/firebase';
  import { collection, doc, updateDoc, deleteDoc, getDocs, query, orderBy } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { uploadBookFile, uploadCoverImage } from '$lib/uploadBook';
  import { SUBJECTS, bookSubjects, subjectsLabel, hasSubject } from '$lib/subjects';
  import {
    YEAR_LEVELS,
    YEAR_LEVEL_GROUPS,
    bookYearLevels,
    yearLevelsLabel,
    hasYearLevel
  } from '$lib/yearLevels';
  import { sortRows, sortIndicator, ariaSort } from '$lib/sortTable';
  import {
    ACCEPTED_EXTENSIONS,
    formatFileSize,
    readerPath,
    validateBookFile,
    ACCEPTED_COVER_EXTENSIONS,
    MAX_COVER_BYTES,
    validateCoverFile
  } from '$lib/supabase';

  // Reactive state variables
  let books = $state([]);
  let filteredBooks = $state([]);
  let loading = $state(true);
  let editingBook = $state(null);
  let errorMessage = $state('');
  let replacementFile = $state(null);
  let replacementInput = $state();

  let coverFile = $state(null);
  let coverInput = $state();
  let coverPreview = $state('');
  let saving = $state(false);

  // Sorting. Every column is sorted by the value its cell shows, so a computed
  // label like the subject list orders the way it reads.
  let sortKey = $state('');
  let sortDir = $state('asc');

  const SORT_COLUMNS = [
    { key: 'title', label: 'Title', value: (b) => b.title },
    { key: 'author', label: 'Author', value: (b) => b.author },
    { key: 'subject', label: 'Subject', value: (b) => subjectsLabel(b) },
    { key: 'yearLevel', label: 'Year level', value: (b) => yearLevelsLabel(b) },
    { key: 'releaseDate', label: 'Release Date', value: (b) => b.releaseDate },
    { key: 'publishedDate', label: 'Published Date', value: (b) => b.publishedDate },
    { key: 'file', label: 'Book file', value: (b) => b.fileName }
  ];

  function toggleSort(key) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      return;
    }
    sortKey = key;
    sortDir = 'asc';
  }

  // Sorting sits on top of filtering rather than inside it, so the two are
  // independent: changing a filter keeps the chosen sort.
  let sortedBooks = $derived.by(() => {
    const column = SORT_COLUMNS.find((c) => c.key === sortKey);
    return column ? sortRows(filteredBooks, column.value, sortDir) : filteredBooks;
  });


  // Search and filter state
  let searchQuery = $state('');
  let filters = $state({
    subject: '',
    yearLevel: '',
    author: '',
    releaseDate: '',
    publishedDate: ''
  });

  const acceptAttribute = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',');
  const coverAccept = ACCEPTED_COVER_EXTENSIONS.map((e) => `.${e}`).join(',');
  const coverSizeLabel = formatFileSize(MAX_COVER_BYTES);

  // Helper function to get today's date in YYYY-MM-DD format
  function getTodayDate() {
    return new Date().toISOString().split('T')[0];
  }

  function emptyForm() {
    return {
      title: '',
      author: '',
      detail: '',
      subjects: [],
      yearLevels: [],
      downloadedFrom: '',
      releaseDate: getTodayDate(),
      publishedDate: getTodayDate(),
      // Held on the form so a removal writes an empty string back, the same way
      // an edit to any other field does.
      coverUrl: '',
      coverPath: ''
    };
  }

  function handleCoverSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const problem = validateCoverFile(file);

    if (problem) {
      errorMessage = problem;
      clearCoverSelection();
      event.target.value = '';
      return;
    }

    if (coverPreview) URL.revokeObjectURL(coverPreview);
    coverFile = file;
    coverPreview = URL.createObjectURL(file);
    errorMessage = '';
  }

  /** Drop a newly chosen image, keeping whatever cover the book already had. */
  function clearCoverSelection() {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    coverPreview = '';
    coverFile = null;
    if (coverInput) coverInput.value = '';
  }

  /** Take the cover off the book entirely. */
  function removeCover() {
    clearCoverSelection();
    bookForm.coverUrl = '';
    bookForm.coverPath = '';
  }

  // Book form data
  let bookForm = $state(emptyForm());

  // Load books data
  async function loadBooks() {
    try {
      const booksQuery = query(collection(db, 'books'), orderBy('title'));
      const booksSnapshot = await getDocs(booksQuery);
      books = booksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      filteredBooks = [...books]; // Initialize filtered books
      applyFilters();
      loading = false;
    } catch (error) {
      console.error('Error loading books:', error);
      errorMessage = 'Could not load books: ' + error.message;
      loading = false;
    }
  }

  // Apply filters to books
  function applyFilters() {
    filteredBooks = books.filter(book => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const title = book.title?.toLowerCase() || '';
        const author = book.author?.toLowerCase() || '';
        const subject = subjectsLabel(book).toLowerCase();

        const matchesSearch = 
          title.includes(query) ||
          author.includes(query) ||
          subject.includes(query);

        if (!matchesSearch) {
          return false;
        }
      }

      // Subject filter
      if (filters.subject && !hasSubject(book, filters.subject)) {
        return false;
      }

      // Year level filter
      if (filters.yearLevel && !hasYearLevel(book, filters.yearLevel)) {
        return false;
      }

      // Author filter
      if (filters.author && book.author !== filters.author) {
        return false;
      }

      // Release date filter
      if (filters.releaseDate && book.releaseDate !== filters.releaseDate) {
        return false;
      }

      // Published date filter
      if (filters.publishedDate && book.publishedDate !== filters.publishedDate) {
        return false;
      }

      return true;
    });
  }

  // Get unique values for filters
  function getUniqueSubjects() {
    // The canonical list rather than whatever happens to be in the data, so a
    // subject with no books yet can still be filtered on.
    return SUBJECTS;
  }

  function getUniqueAuthors() {
    return [...new Set(books.map(b => b.author).filter(Boolean))].sort();
  }

  function getUniqueDates() {
    return [...new Set(books.map(b => b.releaseDate).filter(Boolean))].sort().reverse();
  }

  function getUniquePublishedDates() {
    return [...new Set(books.map(b => b.publishedDate).filter(Boolean))].sort().reverse();
  }

  // Reset all filters
  function resetFilters() {
    filters = {
      subject: '',
      yearLevel: '',
      author: '',
      releaseDate: '',
      publishedDate: ''
    };
    searchQuery = '';
    applyFilters();
  }

  // Edit book
  function editBook(book) {
    editingBook = book;
    errorMessage = '';
    replacementFile = null;
    clearCoverSelection();
    // Copy only the editable fields. Spreading the whole book would carry the
    // document id into the form and write it back into the document.
    bookForm = {
      title: book.title ?? '',
      author: book.author ?? '',
      detail: book.detail ?? '',
      subjects: bookSubjects(book),
      yearLevels: bookYearLevels(book),
      downloadedFrom: book.downloadedFrom ?? '',
      releaseDate: book.releaseDate ?? getTodayDate(),
      publishedDate: book.publishedDate ?? getTodayDate(),
      coverUrl: book.coverUrl ?? '',
      coverPath: book.coverPath ?? ''
    };
  }

  function cancelEdit() {
    editingBook = null;
    bookForm = emptyForm();
    replacementFile = null;
    clearCoverSelection();
    errorMessage = '';
  }

  function handleReplacementSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const problem = validateBookFile(file);

    if (problem) {
      errorMessage = problem;
      replacementFile = null;
      event.target.value = '';
      return;
    }

    replacementFile = file;
    errorMessage = '';
  }

  // Update book, optionally replacing its file
  async function updateBook(event) {
    event?.preventDefault();
    errorMessage = '';
    saving = true;

    try {
      const changes = {
        ...bookForm,
        // Mirrored for the app's recommendations, which still read `subject`.
        subject: (bookForm.subjects || []).join(', ')
      };

      if (replacementFile) {
        const uploaded = await uploadBookFile(replacementFile);
        changes.fileUrl = uploaded.fileUrl;
        changes.filePath = uploaded.filePath;
        changes.fileName = uploaded.fileName;
        changes.fileSize = uploaded.fileSize;
      }

      if (coverFile) {
        const cover = await uploadCoverImage(coverFile);
        changes.coverUrl = cover.coverUrl;
        changes.coverPath = cover.coverPath;
      }

      await updateDoc(doc(db, 'books', editingBook.id), changes);
      cancelEdit();
      await loadBooks(); // Refresh data and apply filters
    } catch (error) {
      console.error('Error updating book:', error);
      errorMessage = 'Could not save: ' + error.message;
    } finally {
      saving = false;
    }
  }

  // Delete book
  async function deleteBook(bookId) {
    if (confirm('Are you sure you want to delete this book?')) {
      try {
        await deleteDoc(doc(db, 'books', bookId));
        await loadBooks(); // Refresh data and apply filters
      } catch (error) {
        console.error('Error deleting book:', error);
        errorMessage = 'Could not delete: ' + error.message;
      }
    }
  }

  // Logout
  async function logout() {
    try {
      await signOut(auth);
      goto('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  }

  // Watch for filter and search changes.
  //
  // Every input is read here rather than left to applyFilters. That function
  // returns as soon as a book fails a check, so when a search matched nothing
  // the later filters were never read, and changing one of them did not
  // re-run this.
  $effect(() => {
    searchQuery;
    filters.subject;
    filters.yearLevel;
    filters.author;
    filters.releaseDate;
    filters.publishedDate;
    books;
    applyFilters();
  });

  // Initialize on component mount
  loadBooks();
</script>

<div class="dashboard-container">
  <!-- Header -->
  <header class="dashboard-header">
    <div class="header-left">
      <h1>Gardner E-Books Library Dashboard</h1>
      <p class="user-info">Books Management</p>
    </div>
    <div class="header-actions">
      <button class="register-btn" onclick={() => goto('/dashboard')}>Return to Dashboard</button>
      <button class="register-btn" onclick={() => goto('/dashboard/upload')}>Upload Book</button>
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  {#if errorMessage}
    <div class="banner error">{errorMessage}</div>
  {/if}

  {#if loading}
    <div class="loading">Loading books...</div>
  {:else}
    <!-- Statistics Cards -->
    <section class="stats-section">
      <h2>Overview</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-number">{books.length}</div>
          <div class="stat-label">Total Books</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">{filteredBooks.length}</div>
          <div class="stat-label">Filtered Books</div>
        </div>
      </div>
    </section>

    <!-- Filters Section -->
    <section class="stats-section">
      <h2>Filters</h2>
      <div class="filters-container">
        <div class="search-group">
          <label for="searchInput">Search</label>
          <input 
            id="searchInput" 
            type="text" 
            placeholder="Search title, author, or subject" 
            bind:value={searchQuery}
          />
        </div>
        
        <div class="filter-group">
          <label for="subjectFilter">Subject</label>
          <select id="subjectFilter" bind:value={filters.subject}>
            <option value="">All Subjects</option>
            {#each getUniqueSubjects() as subject}
              <option value={subject}>{subject}</option>
            {/each}
          </select>
        </div>
        
        <div class="filter-group">
          <label for="yearLevelFilter">Year level</label>
          <select id="yearLevelFilter" bind:value={filters.yearLevel}>
            <option value="">All Year Levels</option>
            {#each YEAR_LEVELS as level}
              <option value={level}>{level}</option>
            {/each}
          </select>
        </div>

        <div class="filter-group">
          <label for="authorFilter">Author</label>
          <select id="authorFilter" bind:value={filters.author}>
            <option value="">All Authors</option>
            {#each getUniqueAuthors() as author}
              <option value={author}>{author}</option>
            {/each}
          </select>
        </div>
        
        <div class="filter-group">
          <label for="dateFilter">Release Date</label>
          <select id="dateFilter" bind:value={filters.releaseDate}>
            <option value="">All Dates</option>
            {#each getUniqueDates() as date}
              <option value={date}>{date}</option>
            {/each}
          </select>
        </div>
        
        <div class="filter-group">
          <label for="publishedDateFilter">Published Date</label>
          <select id="publishedDateFilter" bind:value={filters.publishedDate}>
            <option value="">All Published Dates</option>
            {#each getUniquePublishedDates() as date}
              <option value={date}>{date}</option>
            {/each}
          </select>
        </div>
        
        <div class="filter-actions">
          <button class="register-btn" onclick={resetFilters}>Reset Filters</button>
        </div>
      </div>
    </section>

    <!-- Books Table -->
    <section class="stats-section">
      <h2>Books List</h2>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              {#each SORT_COLUMNS as column}
                <th aria-sort={ariaSort(column.key, sortKey, sortDir)}>
                  <button class="sort-btn" onclick={() => toggleSort(column.key)}>
                    {column.label}{sortIndicator(column.key, sortKey, sortDir)}
                  </button>
                </th>
              {/each}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each sortedBooks as book, index}
              <tr>
                <td>{index + 1}</td>
                <td>{book.title}</td>
                <td>{book.author}</td>
                <td>{subjectsLabel(book) || '—'}</td>
                <td>{yearLevelsLabel(book) || 'All levels'}</td>
                <td>{book.releaseDate}</td>
                <td>{book.publishedDate || '-'}</td>
                <td class="file-cell">
                  {#if book.fileUrl}
                    <a class="file-name-link" href={book.fileUrl} target="_blank" rel="noreferrer">
                      {book.fileName || 'Open file'}
                    </a>
                    <div class="file-meta">
                      {#if book.fileSize}<span>{formatFileSize(book.fileSize)}</span>{/if}
                      <a href={readerPath(book.fileUrl)} target="_blank" rel="noreferrer">Preview</a>
                    </div>
                  {:else}
                    <span class="file-missing" title="The mobile app cannot open this book until a file is uploaded">
                      No file - not readable in app
                    </span>
                  {/if}
                </td>
                <td>
                  <button class="table-btn edit-btn" onclick={() => editBook(book)}>Edit</button>
                  <button class="table-btn delete-btn" onclick={() => deleteBook(book.id)}>Delete</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <!-- Edit dialog -->
  {#if editingBook}
    <div class="modal-backdrop">
      <button type="button" class="modal-scrim" aria-label="Close editor" onclick={cancelEdit}></button>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Edit book">
        <h2>Edit "{editingBook.title}"</h2>

        <form onsubmit={updateBook}>
          <div class="form-group">
            <label class="field-label" for="edit-file">Book file</label>
            {#if editingBook.fileUrl}
              <p class="field-hint current-file">
                Currently: <a href={editingBook.fileUrl} target="_blank" rel="noreferrer">
                  {editingBook.fileName || 'uploaded file'}
                </a>
                {#if editingBook.fileSize}({formatFileSize(editingBook.fileSize)}){/if}
              </p>
            {:else}
              <p class="field-hint missing-file">
                No file uploaded yet, so this book cannot be opened in the app.
              </p>
            {/if}
            <input
              id="edit-file"
              type="file"
              bind:this={replacementInput}
              onchange={handleReplacementSelect}
              accept={acceptAttribute}
            />
            <p class="field-hint">
              {replacementFile
                ? `Will replace the file with ${replacementFile.name} (${formatFileSize(replacementFile.size)}).`
                : 'Choose a file only if you want to replace the current one.'}
            </p>
          </div>

          <div class="form-group">
            <span class="field-label">Cover image</span>
            <div class="cover-row">
              {#if coverPreview}
                <img class="cover-preview" src={coverPreview} alt="New cover" />
              {:else if bookForm.coverUrl}
                <img class="cover-preview" src={bookForm.coverUrl} alt="Current cover" />
              {:else}
                <div class="cover-preview cover-placeholder">No cover</div>
              {/if}

              <div class="cover-actions">
                <label for="edit-cover" class="cover-pick">
                  {bookForm.coverUrl || coverFile ? 'Choose a different image' : 'Choose an image'}
                </label>
                <input
                  id="edit-cover"
                  type="file"
                  bind:this={coverInput}
                  onchange={handleCoverSelect}
                  accept={coverAccept}
                  class="file-input"
                />
                {#if coverFile}
                  <button type="button" class="cover-remove" onclick={clearCoverSelection}>
                    Cancel this change
                  </button>
                  <p class="field-hint">
                    {coverFile.name} &middot; {formatFileSize(coverFile.size)} &middot; saved when you save the book.
                  </p>
                {:else if bookForm.coverUrl}
                  <button type="button" class="cover-remove" onclick={removeCover}>
                    Remove cover
                  </button>
                {/if}
              </div>
            </div>
            <p class="field-hint">
              Optional. {ACCEPTED_COVER_EXTENSIONS.join(', ').toUpperCase()} &middot; up to {coverSizeLabel}.
            </p>
          </div>

          <div class="form-group">
            <label class="field-label" for="edit-title">Title *</label>
            <input id="edit-title" type="text" bind:value={bookForm.title} required />
          </div>

          <div class="form-group">
            <label class="field-label" for="edit-author">Author *</label>
            <input id="edit-author" type="text" bind:value={bookForm.author} required />
          </div>

          <div class="form-group">
            <span class="field-label">Subjects *</span>
            <div class="subject-grid">
              {#each SUBJECTS as subject}
                <label class="subject-option">
                  <input type="checkbox" value={subject} bind:group={bookForm.subjects} />
                  <span>{subject}</span>
                </label>
              {/each}
            </div>
          </div>

          <div class="form-group">
            <span class="field-label">Year levels</span>
            {#each YEAR_LEVEL_GROUPS as group}
              <div class="level-group">
                <span class="level-group-label">{group.label}</span>
                <div class="level-options">
                  {#each group.levels as level}
                    <label class="subject-option">
                      <input type="checkbox" value={level} bind:group={bookForm.yearLevels} />
                      <span>{level}</span>
                    </label>
                  {/each}
                </div>
              </div>
            {/each}
            <p class="field-hint">Leave clear to recommend the book to every year level.</p>
          </div>

          <div class="form-group">
            <label class="field-label" for="edit-release">Release date</label>
            <input id="edit-release" type="date" bind:value={bookForm.releaseDate} />
          </div>

          <div class="form-group">
            <label class="field-label" for="edit-published">Published date</label>
            <input id="edit-published" type="date" bind:value={bookForm.publishedDate} />
          </div>

          <div class="form-group">
            <label class="field-label" for="edit-from">Downloaded from</label>
            <input id="edit-from" type="text" bind:value={bookForm.downloadedFrom} />
          </div>

          <div class="form-group">
            <label class="field-label" for="edit-detail">Details</label>
            <textarea id="edit-detail" rows="4" bind:value={bookForm.detail}></textarea>
          </div>

          <div class="modal-actions">
            <button type="button" class="cancel-btn" onclick={cancelEdit} disabled={saving}>Cancel</button>
            <button type="submit" class="submit-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}

</div>

<style>
  @import '../style.css';

  /* A header that is also a control: a button so it is reachable by keyboard,
     styled to look like the heading it replaces. */
  .sort-btn {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .sort-btn:hover {
    color: var(--brand);
    text-decoration: underline;
  }

  .cover-row {
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }

  .cover-preview {
    width: 96px;
    height: 132px;
    object-fit: cover;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-alt);
    flex-shrink: 0;
  }

  .cover-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .cover-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  /* A label rather than a button, so it can drive the hidden file input. */
  .cover-pick {
    display: inline-block;
    background: white;
    color: var(--brand);
    border: 2px solid var(--brand);
    padding: 8px 16px;
    border-radius: var(--radius);
    font-size: 0.875rem;
    font-weight: bold;
    cursor: pointer;
  }

  .cover-pick:hover {
    background: var(--brand);
    color: white;
  }

  .cover-remove {
    background: none;
    border: none;
    padding: 0;
    color: var(--danger);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
  }

  .file-input {
    display: none;
  }

  .subject-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
  }

  .subject-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    cursor: pointer;
  }

  .subject-option:hover {
    border-color: var(--brand);
    background: var(--brand-tint);
  }

  .subject-option input {
    width: auto;
    margin: 0;
  }

  .level-group {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .level-group-label {
    min-width: 92px;
    font-size: 13px;
    font-weight: 600;
    color: #52514e;
  }

  .level-options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
  }

  .header-left {
    display: flex;
    flex-direction: column;
  }

  .user-info {
    color: #666;
    margin: 5px 0 0 0;
    font-size: 0.875rem;
  }

  .banner.error {
    background: #fdecea;
    color: #b3261e;
    border: 1px solid #f5c2c0;
    border-radius: var(--radius-sm);
    padding: 12px 16px;
    margin-bottom: 16px;
  }

  .file-cell {
    max-width: 280px;
  }

  .file-name-link {
    display: block;
    color: #033047;
    font-weight: 600;
    text-decoration: none;
    word-break: break-word;
  }

  .file-name-link:hover {
    text-decoration: underline;
  }

  .file-meta {
    display: flex;
    gap: 10px;
    margin-top: 4px;
    font-size: 0.75rem;
    color: #666;
  }

  .file-meta a {
    color: #033047;
    text-decoration: none;
  }

  .file-meta a:hover {
    text-decoration: underline;
  }

  .file-missing {
    color: #b3261e;
    font-weight: 600;
  }

  .modal-scrim {
    position: fixed;
    inset: 0;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: default;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 40px 16px;
    overflow-y: auto;
    z-index: 100;
  }

  .modal {
    position: relative;
    background: #fff;
    border-radius: var(--radius);
    padding: 24px;
    width: 100%;
    max-width: 560px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  }

  .modal h2 {
    margin-top: 0;
    color: #033047;
    font-size: 1.125rem;
    font-weight: bold;
  }

  .modal .form-group {
    margin-bottom: 16px;
  }

  .modal input,
  .modal textarea {
    width: 100%;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    font-family: inherit;
    box-sizing: border-box;
  }

  .modal input:focus,
  .modal textarea:focus {
    outline: none;
    border-color: #033047;
    box-shadow: 0 0 0 2px rgba(3, 48, 71, 0.25);
  }

  .search-group {
    display: flex;
    flex-direction: column;
    min-width: 300px;
    flex-grow: 1;
  }

  .search-group input {
    padding: 8px 12px;
    border: 1px solid #ccc;
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    background: white;
    transition: border-color 0.2s ease;
  }

  .search-group input:focus {
    outline: none;
    border-color: #033047;
    box-shadow: 0 0 0 2px rgba(3, 48, 71, 0.25);
  }

  .data-table th:nth-child(1) {
    width: 50px;
    text-align: center;
  }

  .data-table td:nth-child(1) {
    text-align: center;
    font-weight: bold;
  }

  #edit-title,
  #edit-author {
    text-transform: uppercase;
  }
</style>
