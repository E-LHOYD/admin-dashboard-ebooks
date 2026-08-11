<script>
  import { auth, db } from '$lib/firebase';
  import { collection, addDoc } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { uploadBookFile } from '$lib/uploadBook';
  import { SUBJECTS } from '$lib/subjects';
  import {
    ACCEPTED_EXTENSIONS,
    MAX_FILE_BYTES,
    formatFileSize,
    isSupabaseConfigured,
    SUPABASE_SETUP_HINT,
    validateBookFile
  } from '$lib/supabase';

  // Reactive state variables
  let uploading = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');

  // File handling
  let selectedFile = $state(null);
  let fileInput = $state();

  const acceptAttribute = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',');
  const sizeLimitLabel = formatFileSize(MAX_FILE_BYTES);

  // Helper function to get today's date
  function getTodayDate() {
    return new Date().toISOString().split('T')[0];
  }

  let bookForm = $state({
    title: '',
    author: '',
    detail: '',
    subjects: [],
    downloadedFrom: '',
    releaseDate: getTodayDate(),
    publishedDate: ''
  });

  // Handle file selection
  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const problem = validateBookFile(file);

    if (problem) {
      errorMessage = problem;
      selectedFile = null;
      event.target.value = '';
      return;
    }

    selectedFile = file;
    errorMessage = '';
  }

  // Add new book: upload the file first, then save the document that points at it.
  async function addBook(event) {
    event.preventDefault();
    errorMessage = '';
    successMessage = '';

    if (!bookForm.title || !bookForm.author) {
      errorMessage = 'Please fill in all required fields';
      return;
    }

    if (bookForm.subjects.length === 0) {
      errorMessage = 'Choose at least one subject.';
      return;
    }

    if (!selectedFile) {
      errorMessage = 'Choose the book file to upload. Without it the book cannot be opened in the app.';
      return;
    }

    if (!auth.currentUser) {
      errorMessage = 'You must be logged in to upload books';
      return;
    }

    uploading = true;

    try {
      // Uploaded before the document is written, so a book is never saved
      // pointing at a file that does not exist.
      const uploaded = await uploadBookFile(selectedFile);

      const bookData = {
        title: bookForm.title.trim(),
        author: bookForm.author.trim(),
        detail: bookForm.detail,
        subjects: [...bookForm.subjects],
        // Also written as a joined string: the app's recommendations still read
        // the old single `subject` field.
        subject: bookForm.subjects.join(', '),
        downloadedFrom: bookForm.downloadedFrom,
        releaseDate: bookForm.releaseDate,
        publishedDate: bookForm.publishedDate,
        fileUrl: uploaded.fileUrl,
        filePath: uploaded.filePath,
        fileName: uploaded.fileName,
        fileSize: uploaded.fileSize
      };

      const docRef = await addDoc(collection(db, 'books'), bookData);
      console.log('Book saved with ID:', docRef.id, bookData);
    } catch (uploadOrSaveError) {
      console.error('Could not add book:', uploadOrSaveError);
      errorMessage = uploadOrSaveError.message;
      return;
    } finally {
      uploading = false;
    }

    resetForm();
    successMessage = 'Book uploaded and saved successfully!';

    setTimeout(() => {
      successMessage = '';
    }, 4000);
  }

  // Reset form
  function resetForm() {
    bookForm = {
      title: '',
      author: '',
      detail: '',
      subjects: [],
      downloadedFrom: '',
      releaseDate: getTodayDate(),
      publishedDate: ''
    };
    selectedFile = null;
    if (fileInput) fileInput.value = '';
    errorMessage = '';
    successMessage = '';
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

</script>

<div class="upload-container">
  <!-- Header -->
  <header class="page-header">
    <div class="header-content">
      <h1>Upload Book</h1>
      <nav class="breadcrumb">
        <a href="/dashboard">Dashboard</a> / <a href="/dashboard/books">Books</a> / Upload
      </nav>
    </div>
    <div class="header-actions">
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  <!-- Upload Form -->
  <section class="upload-section">
    <div class="upload-card">
      <h2>Book Information</h2>
      
      {#if !isSupabaseConfigured}
        <div class="error-message">Storage is not configured. {SUPABASE_SETUP_HINT}</div>
      {/if}

      {#if errorMessage}
        <div class="error-message">{errorMessage}</div>
      {/if}
      
      {#if successMessage}
        <div class="success-message">{successMessage}</div>
      {/if}

      <form onsubmit={addBook}>
        <!-- Book file (required) -->
        <div class="form-group">
          <span class="field-label">Book file *</span>
          <label for="file-upload" class="file-upload-label">
            <div class="file-upload-area">
              {#if selectedFile}
                <div class="file-info">
                  <div class="file-icon">📄</div>
                  <div class="file-details">
                    <div class="file-name">{selectedFile.name}</div>
                    <div class="file-size">{formatFileSize(selectedFile.size)}</div>
                  </div>
                </div>
              {:else}
                <div class="upload-prompt">
                  <div class="upload-icon">📁</div>
                  <div>Click to select the book file</div>
                  <div class="upload-hint">
                    {ACCEPTED_EXTENSIONS.join(', ').toUpperCase()} &middot; up to {sizeLimitLabel}
                  </div>
                </div>
              {/if}
            </div>
          </label>
          <input
            id="file-upload"
            type="file"
            bind:this={fileInput}
            onchange={handleFileSelect}
            accept={acceptAttribute}
            class="file-input"
          />
          <p class="field-hint">
            The file uploads straight to storage when you save, and the book record points at it.
          </p>
        </div>

        <!-- Book Details -->
        <div class="form-grid">
          <div class="form-group">
            <label class="field-label" for="book-title">Book title *</label>
            <input id="book-title" type="text" bind:value={bookForm.title} required />
          </div>
          <div class="form-group">
            <label class="field-label" for="book-author">Author *</label>
            <input id="book-author" type="text" bind:value={bookForm.author} required />
          </div>
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
          <p class="field-hint">A book can belong to more than one subject.</p>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label class="field-label" for="release-date">Release date *</label>
            <input id="release-date" type="date" bind:value={bookForm.releaseDate} required />
          </div>
          <div class="form-group">
            <label class="field-label" for="published-date">Published date</label>
            <input id="published-date" type="date" bind:value={bookForm.publishedDate} />
            <p class="field-hint">When the book itself was published, if it differs from the release date.</p>
          </div>
        </div>

        <div class="form-group">
          <label class="field-label" for="downloaded-from">Downloaded from</label>
          <input id="downloaded-from" type="text" placeholder="Optional" bind:value={bookForm.downloadedFrom} />
        </div>

        <div class="form-group">
          <label class="field-label" for="book-detail">Book details and description *</label>
          <textarea id="book-detail" bind:value={bookForm.detail} rows="4" required></textarea>
        </div>

        {#if uploading}
          <div class="upload-progress">
            <div class="progress-bar indeterminate"><div class="progress-fill"></div></div>
            <div class="progress-text">
              Uploading {selectedFile ? formatFileSize(selectedFile.size) : ''}&hellip; this can take a moment for large books.
            </div>
          </div>
        {/if}

        <!-- Form Actions -->
        <div class="form-actions">
          <button type="button" class="cancel-btn" onclick={resetForm}>Reset</button>
          <button type="submit" class="submit-btn" disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload Book'}
          </button>
        </div>
      </form>
    </div>
  </section>
</div>

<style>
  @import '../style.css';

  .field-label {
    display: block;
    margin-bottom: 8px;
    font-weight: 600;
    color: #333;
  }

  .subject-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
  }

  .subject-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
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

  .file-upload-label {
    display: block;
    cursor: pointer;
  }

  .file-upload-area {
    border: 2px dashed #ddd;
    border-radius: 8px;
    padding: 30px;
    text-align: center;
    transition: border-color 0.3s ease, background-color 0.3s ease;
  }

  .file-upload-area:hover {
    border-color: #007bff;
    background-color: #f8f9ff;
  }

  .file-input {
    display: none;
  }

  .upload-prompt {
    color: #666;
  }

  .upload-icon,
  .file-icon {
    font-size: 34px;
    margin-bottom: 8px;
  }

  .upload-hint {
    font-size: 12px;
    color: #999;
    margin-top: 6px;
  }

  .file-info {
    color: #333;
  }

  .file-name {
    font-weight: 600;
    word-break: break-all;
  }

  .file-size {
    font-size: 13px;
    color: #666;
  }

  .upload-progress {
    margin-bottom: 20px;
  }

  .progress-bar {
    height: 6px;
    background: #e9ecef;
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar.indeterminate .progress-fill {
    width: 40%;
    height: 100%;
    background: #007bff;
    border-radius: 3px;
    animation: slide 1.2s ease-in-out infinite;
  }

  @keyframes slide {
    0% { margin-left: -40%; }
    100% { margin-left: 100%; }
  }

  .progress-text {
    margin-top: 8px;
    font-size: 13px;
    color: #666;
    text-align: center;
  }


  .field-hint {
    margin: 6px 0 0 0;
    font-size: 13px;
    line-height: 1.5;
    color: #666;
  }


  .upload-container {
    max-width: 800px;
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

  .upload-section {
    margin-bottom: 40px;
  }

  .upload-card {
    background: white;
    padding: 30px;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  }

  .upload-card h2 {
    margin-top: 0;
    margin-bottom: 25px;
    color: #333;
  }

  .error-message {
    background: #f8d7da;
    color: #721c24;
    padding: 12px;
    border-radius: 6px;
    margin-bottom: 20px;
    border: 1px solid #f5c6cb;
  }

  .success-message {
    background: #d4edda;
    color: #155724;
    padding: 12px;
    border-radius: 6px;
    margin-bottom: 20px;
    border: 1px solid #c3e6cb;
  }













  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 15px;
    margin-bottom: 20px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group input, .form-group textarea {
    width: 100%;
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    transition: border-color 0.3s ease;
  }

  .form-group input:focus, .form-group textarea:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
  }

  .form-group textarea {
    resize: vertical;
    min-height: 100px;
  }





  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 15px;
    margin-top: 30px;
  }

  .cancel-btn {
    background: #6c757d;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    transition: background-color 0.3s ease;
  }

  .cancel-btn:hover {
    background: #5a6268;
  }


  .submit-btn {
    background: #28a745;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    transition: background-color 0.3s ease;
  }

  .submit-btn:hover:not(:disabled) {
    background: #218838;
  }

  .submit-btn:disabled {
    background: #6c757d;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .form-grid {
      grid-template-columns: 1fr;
    }
    
    
  }
</style>
