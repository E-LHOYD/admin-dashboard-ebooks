<script>
  import { auth, db } from '$lib/firebase';
  import { collection, addDoc } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { uploadBookFile } from '$lib/uploadBook';
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
    subject: '',
    downloadedFrom: '',
    releaseDate: getTodayDate()
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

    if (!bookForm.title || !bookForm.author || !bookForm.subject) {
      errorMessage = 'Please fill in all required fields';
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
        subject: bookForm.subject.trim(),
        downloadedFrom: bookForm.downloadedFrom,
        releaseDate: bookForm.releaseDate,
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
      subject: '',
      downloadedFrom: '',
      releaseDate: getTodayDate()
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

<div class="dashboard-container">
  <!-- Header -->
  <header class="dashboard-header">
    <div class="header-left">
      <h1>Gardner E-Books Library Dashboard</h1>
      <p class="user-info">Upload Book</p>
    </div>
    <div class="header-actions">
      <button class="register-btn" onclick={() => goto('/dashboard/books')}>Back to Books</button>
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  <!-- Upload Form -->
  <section class="stats-section">
    <div class="upload-card">
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
            <input 
              type="text" 
              placeholder="Book Title *" 
              bind:value={bookForm.title} 
              required
            />
          </div>
          <div class="form-group">
            <input 
              type="text" 
              placeholder="Author *" 
              bind:value={bookForm.author} 
              required
            />
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <input 
              type="text" 
              placeholder="Subject *" 
              bind:value={bookForm.subject} 
              required
            />
          </div>
          <div class="form-group">
            <input 
              type="date" 
              bind:value={bookForm.releaseDate} 
              required
            />
          </div>
        </div>

        <div class="form-group">
          <input 
            type="text" 
            placeholder="Downloaded From (Optional)" 
            bind:value={bookForm.downloadedFrom}
          />
        </div>

        <div class="form-group">
          <textarea 
            placeholder="Book Details/Description *" 
            bind:value={bookForm.detail} 
            rows="4" 
            required
          ></textarea>
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

  .stats-section {
    margin-bottom: 40px;
  }

  .stats-section h2 {
    color: #033047;
    font-size: 1rem;
    font-weight: bold;
    margin-bottom: 20px;
  }

  .upload-card {
    background: white;
    border: 1px solid #ccc;
    border-radius: 8px;
    padding: 30px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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

  .file-upload-label {
    display: block;
    cursor: pointer;
  }

  .file-upload-area {
    border: 2px dashed #ccc;
    border-radius: 8px;
    padding: 30px;
    text-align: center;
    transition: border-color 0.3s ease, background-color 0.3s ease;
  }

  .file-upload-area:hover {
    border-color: #033047;
    background-color: #f8f9fa;
  }

  .file-input {
    display: none;
  }

  .upload-prompt {
    color: #666;
  }

  .upload-icon,
  .file-icon {
    font-size: 2.125rem;
    margin-bottom: 8px;
  }

  .upload-hint {
    font-size: 0.75rem;
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
    font-size: 0.8125rem;
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
    background: #033047;
    border-radius: 3px;
    animation: slide 1.2s ease-in-out infinite;
  }

  @keyframes slide {
    0% { margin-left: -40%; }
    100% { margin-left: 100%; }
  }

  .progress-text {
    margin-top: 8px;
    font-size: 0.8125rem;
    color: #666;
    text-align: center;
  }

  .field-hint {
    margin: 6px 0 0 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: #666;
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
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 0.875rem;
    transition: border-color 0.3s ease;
  }

  .form-group input:focus, .form-group textarea:focus {
    outline: none;
    border-color: #033047;
    box-shadow: 0 0 0 2px rgba(3, 48, 71, 0.25);
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

  .submit-btn:hover:not(:disabled) {
    background: #024060;
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
