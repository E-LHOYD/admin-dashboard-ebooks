<script>
  import { auth, db } from '$lib/firebase';
  import { collection, doc, updateDoc, deleteDoc, getDocs, query, orderBy } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { isMegaUrl, MEGA_URL_HINT, readerPath } from '$lib/mega';

  // Reactive state variables
  let books = $state([]);
  let loading = $state(true);
  let editingBook = $state(null);
  let errorMessage = $state('');

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
      releaseDate: getTodayDate(),
      megaFileUrl: ''
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
    // Copy only the editable fields. Spreading the whole book would carry the
    // document id into the form and write it back into the document.
    bookForm = {
      title: book.title ?? '',
      author: book.author ?? '',
      detail: book.detail ?? '',
      subject: book.subject ?? '',
      downloadedFrom: book.downloadedFrom ?? '',
      releaseDate: book.releaseDate ?? getTodayDate(),
      megaFileUrl: book.megaFileUrl ?? ''
    };
  }

  function cancelEdit() {
    editingBook = null;
    bookForm = emptyForm();
    errorMessage = '';
  }

  // Update book
  async function updateBook(event) {
    event?.preventDefault();
    errorMessage = '';

    const megaFileUrl = bookForm.megaFileUrl.trim();

    if (!megaFileUrl) {
      errorMessage = 'A MEGA link is required so the book can be opened in the app. ' + MEGA_URL_HINT;
      return;
    }

    if (!isMegaUrl(megaFileUrl)) {
      errorMessage = 'That does not look like a MEGA file link. ' + MEGA_URL_HINT;
      return;
    }

    try {
      await updateDoc(doc(db, 'books', editingBook.id), { ...bookForm, megaFileUrl });
      cancelEdit();
      await loadBooks(); // Refresh data
    } catch (error) {
      console.error('Error updating book:', error);
      errorMessage = 'Could not save: ' + error.message;
    }
  }

  // Copy a MEGA link to the clipboard, with a short "Copied" confirmation.
  let copiedUrl = $state('');
  let copyTimer;

  async function copyUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      copiedUrl = url;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { copiedUrl = ''; }, 2000);
    } catch (error) {
      console.error('Could not copy link:', error);
      errorMessage = 'Could not copy the link. Select it manually instead.';
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
              <th>MEGA URL</th>
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
                <td class="mega-cell">
                  {#if book.megaFileUrl}
                    <a
                      class="mega-url"
                      href={book.megaFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={book.megaFileUrl}
                    >{book.megaFileUrl}</a>
                    <div class="mega-actions">
                      <a href={readerPath(book.megaFileUrl)} target="_blank" rel="noreferrer">Preview</a>
                      <button type="button" class="link-btn" onclick={() => copyUrl(book.megaFileUrl)}>
                        {copiedUrl === book.megaFileUrl ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  {:else}
                    <span class="file-missing" title="The mobile app cannot open this book until a MEGA link is added">
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
            <label class="field-label" for="edit-mega-url">MEGA link *</label>
            <input
              id="edit-mega-url"
              type="url"
              placeholder="https://mega.nz/file/XXXXXXXX#key"
              bind:value={bookForm.megaFileUrl}
              required
            />
            <p class="field-hint">
              Upload the PDF to MEGA, choose Share &rarr; Copy link (keep the key after the
              <code>#</code>), and paste it here. Saved as <code>megaFileUrl</code>.
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
            <button type="button" class="table-btn" onclick={cancelEdit}>Cancel</button>
            <button type="submit" class="table-btn edit-btn">Save changes</button>
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

  .mega-cell {
    max-width: 320px;
  }

  .mega-url {
    display: block;
    color: #0f7b3f;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    line-height: 1.4;
    word-break: break-all;
    text-decoration: none;
  }

  .mega-url:hover {
    text-decoration: underline;
  }

  .mega-actions {
    display: flex;
    gap: 10px;
    margin-top: 4px;
    font-size: 12px;
  }

  .mega-actions a {
    color: #007bff;
    text-decoration: none;
  }

  .mega-actions a:hover {
    text-decoration: underline;
  }

  .link-btn {
    background: none;
    border: none;
    padding: 0;
    color: #007bff;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
  }

  .link-btn:hover {
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

  .field-hint code {
    background: #f1f3f5;
    padding: 1px 4px;
    border-radius: 3px;
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
