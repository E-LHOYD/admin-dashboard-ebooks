<script>
  import { auth, db } from '$lib/firebase';
  import { collection, doc, updateDoc, deleteDoc, getDocs, query, orderBy } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { uploadBookFile } from '$lib/uploadBook';
  import { SUBJECTS, bookSubjects, subjectsLabel, hasSubject } from '$lib/subjects';
  import {
    ACCEPTED_EXTENSIONS,
    formatFileSize,
    readerPath,
    validateBookFile
  } from '$lib/supabase';

  // Reactive state variables
  let books = $state([]);
  let filteredBooks = $state([]);
  let loading = $state(true);
  let editingBook = $state(null);
  let errorMessage = $state('');
  let replacementFile = $state(null);
  let replacementInput = $state();
  let saving = $state(false);

  // Search and filter state
  let searchQuery = $state('');
  let filters = $state({
    subjects: [],
    author: '',
    releaseDate: '',
    publishedDate: ''
  });

  const acceptAttribute = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',');

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
      downloadedFrom: '',
      releaseDate: getTodayDate(),
      publishedDate: getTodayDate()
    };
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
        const documentId = book.id?.toLowerCase() || '';

        const matchesSearch = 
          title.includes(query) ||
          author.includes(query) ||
          subject.includes(query) ||
          documentId.includes(query);

        if (!matchesSearch) {
          return false;
        }
      }

      // Subject filter
      if (filters.subject && !hasSubject(book, filters.subject)) {
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
      subjects: [],
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
    // Copy only the editable fields. Spreading the whole book would carry the
    // document id into the form and write it back into the document.
    bookForm = {
      title: book.title ?? '',
      author: book.author ?? '',
      detail: book.detail ?? '',
      subjects: bookSubjects(book),
      downloadedFrom: book.downloadedFrom ?? '',
      releaseDate: book.releaseDate ?? getTodayDate(),
      publishedDate: book.publishedDate ?? getTodayDate()
    };
  }

  function cancelEdit() {
    editingBook = null;
    bookForm = emptyForm();
    replacementFile = null;
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

  // Watch for filter and search changes
  $effect(() => {
    if (books.length > 0) {
      applyFilters();
    }
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
            placeholder="Search title, author, subject, Document ID" 
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
              <th>Title</th>
              <th>Author</th>
              <th>Subject</th>
              <th>Release Date</th>
              <th>Published Date</th>
              <th>Book file</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredBooks as book}
              <tr>
                <td>{book.title}</td>
                <td>{book.author}</td>
                <td>{subjectsLabel(book) || '—'}</td>
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
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  }

  .subject-option:hover {
    border-color: #007bff;
    background: #f8f9ff;
  }

  .subject-option input {
    width: auto;
    margin: 0;
  }
  
  .dashboard-container {
    background-color: white;
    min-height: 100vh;
    padding: 20px;
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #ccc;
  }

  .header-left {
    display: flex;
    flex-direction: column;
  }

  .dashboard-header h1 {
    color: #033047;
    margin: 0;
    font-size: 1.25rem;
    font-weight: bold;
  }

  .user-info {
    color: #666;
    margin: 5px 0 0 0;
    font-size: 0.875rem;
  }

  .header-actions {
    display: flex;
    gap: 10px;
  }

  .register-btn {
    background: #033047;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: bold;
    width: auto;
  }

  .register-btn:hover {
    background: #024060;
  }

  .logout-btn {
    background: white;
    color: #033047;
    border: 2px solid #033047;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: bold;
    width: auto;
  }

  .logout-btn:hover {
    background: #033047;
    color: white;
  }

  .loading {
    text-align: center;
    font-size: 1rem;
    color: #033047;
    padding: 40px;
  }

  .stats-section {
    margin-bottom: 40px;
  }

  .stats-section h2 {
    color: #033047;
    font-size: 1rem;
    font-weight: bold;
    margin-bottom: 20px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
  }

  .stat-card {
    background: white;
    border: 1px solid #ccc;
    border-radius: 8;
    padding: 30px;
    text-align: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .stat-number {
    font-size: 1.5rem;
    font-weight: bold;
    color: #033047;
    margin-bottom: 10px;
  }

  .stat-label {
    font-size: 0.875rem;
    color: #666;
  }

  .banner.error {
    background: #fdecea;
    color: #b3261e;
    border: 1px solid #f5c2c0;
    border-radius: 5px;
    padding: 12px 16px;
    margin-bottom: 16px;
  }

  .table-container {
    overflow-x: auto;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border: 1px solid #ccc;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .data-table th,
  .data-table td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid #ccc;
  }

  .data-table th {
    background: #f8f9fa;
    font-weight: 600;
    color: #033047;
    border-bottom: 2px solid #ccc;
  }

  .data-table tr:hover {
    background: #f8f9fa;
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

  .table-btn {
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    margin-right: 5px;
    transition: background-color 0.2s ease;
  }

  .edit-btn {
    background: #033047;
    color: white;
  }

  .edit-btn:hover {
    background: #024060;
  }

  .delete-btn {
    background: #dc3545;
    color: white;
  }

  .delete-btn:hover {
    background: #c82333;
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
    border-radius: 8px;
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
    border-radius: 5px;
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

  .field-label {
    display: block;
    margin-bottom: 6px;
    font-weight: 600;
    color: #033047;
  }

  .field-hint {
    margin: 6px 0 0 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: #666;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .cancel-btn {
    background: white;
    color: #033047;
    border: 2px solid #033047;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: bold;
  }

  .cancel-btn:hover {
    background: #033047;
    color: white;
  }

  .submit-btn {
    background: #033047;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: bold;
  }

  .submit-btn:hover {
    background: #024060;
  }

  .filters-container {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    align-items: flex-end;
    padding: 20px;
    background: white;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    min-width: 150px;
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
    border-radius: 6px;
    font-size: 0.875rem;
    background: white;
    transition: border-color 0.2s ease;
  }

  .search-group input:focus {
    outline: none;
    border-color: #033047;
    box-shadow: 0 0 0 2px rgba(3, 48, 71, 0.25);
  }

  .filter-group label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #555;
    margin-bottom: 5px;
  }

  .filter-group select {
    padding: 8px 12px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 0.875rem;
    background: white;
    cursor: pointer;
    transition: border-color 0.2s ease;
  }

  .filter-group select:focus {
    outline: none;
    border-color: #033047;
    box-shadow: 0 0 0 2px rgba(3, 48, 71, 0.25);
  }

  .filter-actions {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-left: auto;
  }
</style>
