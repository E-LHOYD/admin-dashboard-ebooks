<script>
  import { auth, db } from '$lib/firebase';
  import { collection, doc, updateDoc, deleteDoc, getDocs, query, orderBy } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { uploadBookFile } from '$lib/uploadBook';
  import {
    ACCEPTED_EXTENSIONS,
    formatFileSize,
    readerPath,
    validateBookFile
  } from '$lib/supabase';

  // Reactive state variables
  let books = $state([]);
  let loading = $state(true);
  let editingBook = $state(null);
  let errorMessage = $state('');
  let replacementFile = $state(null);
  let replacementInput = $state();
  let saving = $state(false);

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
      subject: '',
      downloadedFrom: '',
      releaseDate: getTodayDate()
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
      loading = false;
    } catch (error) {
      console.error('Error loading books:', error);
      errorMessage = 'Could not load books: ' + error.message;
      loading = false;
    }
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
      subject: book.subject ?? '',
      downloadedFrom: book.downloadedFrom ?? '',
      releaseDate: book.releaseDate ?? getTodayDate()
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
      const changes = { ...bookForm };

      if (replacementFile) {
        const uploaded = await uploadBookFile(replacementFile);
        changes.fileUrl = uploaded.fileUrl;
        changes.filePath = uploaded.filePath;
        changes.fileName = uploaded.fileName;
        changes.fileSize = uploaded.fileSize;
      }

      await updateDoc(doc(db, 'books', editingBook.id), changes);
      cancelEdit();
      await loadBooks(); // Refresh data
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
        await loadBooks(); // Refresh data
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

  // Initialize on component mount
  loadBooks();
</script>

<div class="books-container">
  <!-- Header -->
  <header class="page-header">
    <div class="header-content">
      <h1>Books Management</h1>
      <nav class="breadcrumb">
        <a href="/dashboard">Dashboard</a> / Books
      </nav>
    </div>
    <div class="header-actions">
      <a href="/dashboard/upload" class="upload-btn">📤 Upload Book</a>
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  {#if errorMessage}
    <div class="banner error">{errorMessage}</div>
  {/if}

  {#if loading}
    <div class="loading">Loading books...</div>
  {:else}
    <!-- Books Table -->
    <section class="table-section">
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Subject</th>
              <th>Release Date</th>
              <th>Book file</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each books as book}
              <tr>
                <td>{book.title}</td>
                <td>{book.author}</td>
                <td>{book.subject}</td>
                <td>{book.releaseDate}</td>
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
            <label class="field-label" for="edit-subject">Subject *</label>
            <input id="edit-subject" type="text" bind:value={bookForm.subject} required />
          </div>

          <div class="form-group">
            <label class="field-label" for="edit-release">Release date</label>
            <input id="edit-release" type="date" bind:value={bookForm.releaseDate} />
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
            <button type="button" class="table-btn" onclick={cancelEdit} disabled={saving}>Cancel</button>
            <button type="submit" class="table-btn edit-btn" disabled={saving}>
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

  .banner.error {
    background: #fdecea;
    color: #b3261e;
    border: 1px solid #f5c2c0;
    border-radius: 5px;
    padding: 12px 16px;
    margin-bottom: 16px;
  }

  .file-cell {
    max-width: 280px;
  }

  .file-name-link {
    display: block;
    color: #0f7b3f;
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
    font-size: 12px;
    color: #666;
  }

  .file-meta a {
    color: #007bff;
    text-decoration: none;
  }

  .file-meta a:hover {
    text-decoration: underline;
  }

  .current-file a {
    color: #007bff;
  }

  .missing-file {
    color: #b3261e;
    font-weight: 600;
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
    border-radius: 8px;
    padding: 24px;
    width: 100%;
    max-width: 560px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  }

  .modal h2 {
    margin-top: 0;
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
    font-size: 14px;
    font-family: inherit;
    box-sizing: border-box;
  }

  .field-label {
    display: block;
    margin-bottom: 6px;
    font-weight: 600;
    color: #333;
  }

  .field-hint {
    margin: 6px 0 0 0;
    font-size: 13px;
    line-height: 1.5;
    color: #666;
  }


  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .books-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    font-family: Arial, sans-serif;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #eee;
  }

  .header-content h1 {
    color: #333;
    margin: 0 0 5px 0;
  }

  .breadcrumb {
    color: #666;
    font-size: 14px;
  }

  .breadcrumb a {
    color: #007bff;
    text-decoration: none;
  }

  .breadcrumb a:hover {
    text-decoration: underline;
  }

  .header-actions {
    display: flex;
    gap: 10px;
  }

  
  .upload-btn {
    background: #17a2b8;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 16px;
    text-decoration: none;
    display: inline-block;
    transition: background-color 0.3s ease;
  }

  .upload-btn:hover {
    background: #138496;
    text-decoration: none;
    color: white;
  }

  .table-section {
    margin-bottom: 40px;
  }

  .loading {
    text-align: center;
    padding: 50px;
    font-size: 18px;
    color: #666;
  }
</style>
