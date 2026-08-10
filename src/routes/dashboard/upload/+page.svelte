<script>
  import { auth, db } from '$lib/firebase';
  import { collection, addDoc } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { isMegaUrl, MEGA_URL_HINT } from '$lib/mega';

  // Reactive state variables
  let saving = $state(false);
  let uploading = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');
  let selectedFile = $state(null);
  let useAutoUpload = $state(true); // Default to automatic upload

  // Helper function to get today's date
  function getTodayDate() {
    return new Date().toISOString().split('T')[0];
  }

  // Book form data.
  // megaFileUrl is the MEGA share link for the book file. It is REQUIRED:
  // the mobile app reads books.megaFileUrl to open the reader, and refuses
  // to open a book without it.
  let bookForm = $state({
    title: '',
    author: '',
    detail: '',
    subject: '',
    downloadedFrom: '',
    releaseDate: getTodayDate(),
    megaFileUrl: ''
  });

  // Handle file selection
  function handleFileChange(event) {
    selectedFile = event.target.files[0];
    if (selectedFile) {
      // Auto-fill title from filename if title is empty
      if (!bookForm.title) {
        const fileName = selectedFile.name.replace(/\.[^/.]+$/, ""); // Remove extension
        bookForm.title = fileName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); // Format nicely
      }
    }
  }

  // Upload file to MEGA automatically
  async function uploadToMega() {
    if (!selectedFile) {
      errorMessage = 'Please select a PDF file to upload';
      return null;
    }

    if (!bookForm.title) {
      errorMessage = 'Please enter a book title first';
      return null;
    }

    uploading = true;
    errorMessage = '';

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', bookForm.title);

      console.log('Starting MEGA upload request...', { 
        fileName: selectedFile.name, 
        fileSize: selectedFile.size,
        title: bookForm.title 
      });

      const response = await fetch('/api/mega/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      console.log('MEGA upload response:', { 
        status: response.status, 
        ok: response.ok, 
        result 
      });

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      bookForm.megaFileUrl = result.megaFileUrl;
      console.log('MEGA upload successful:', result);
      return result.megaFileUrl;

    } catch (error) {
      console.error('MEGA upload error:', error);
      errorMessage = `Failed to upload to MEGA: ${error.message}`;
      return null;
    } finally {
      uploading = false;
    }
  }

  // Add new book
  async function addBook(event) {
    event.preventDefault();
    errorMessage = '';
    successMessage = '';

    // Validate form
    if (!bookForm.title || !bookForm.author || !bookForm.subject) {
      errorMessage = 'Please fill in all required fields';
      return;
    }

    let megaFileUrl = '';

    if (useAutoUpload) {
      // Automatic MEGA upload
      if (!selectedFile) {
        errorMessage = 'Please select a PDF file to upload';
        return;
      }

      megaFileUrl = await uploadToMega();
      if (!megaFileUrl) {
        return; // Upload failed, error message already set
      }
    } else {
      // Manual MEGA link entry
      megaFileUrl = bookForm.megaFileUrl.trim();

      if (!megaFileUrl) {
        errorMessage = 'A MEGA link is required so the book can be opened in the app. ' + MEGA_URL_HINT;
        return;
      }

      if (!isMegaUrl(megaFileUrl)) {
        errorMessage = 'That does not look like a MEGA file link. ' + MEGA_URL_HINT;
        return;
      }
    }

    // Check authentication
    if (!auth.currentUser) {
      errorMessage = 'You must be logged in to add books';
      return;
    }

    const bookData = {
      title: bookForm.title.trim(),
      author: bookForm.author.trim(),
      detail: bookForm.detail,
      subject: bookForm.subject.trim(),
      downloadedFrom: bookForm.downloadedFrom,
      releaseDate: bookForm.releaseDate,
      megaFileUrl
    };

    saving = true;

    try {
      const docRef = await addDoc(collection(db, 'books'), bookData);
      console.log('Book saved with ID:', docRef.id, bookData);
    } catch (firestoreError) {
      console.error('Firestore error:', firestoreError);
      errorMessage = `Failed to save book: ${firestoreError.message}`;
      return;
    } finally {
      saving = false;
    }

    resetForm();
    successMessage = 'Book saved successfully!';

    // Clear success message after 3 seconds
    setTimeout(() => {
      successMessage = '';
    }, 3000);
  }

  // Reset form
  function resetForm() {
    bookForm = {
      title: '',
      author: '',
      detail: '',
      subject: '',
      downloadedFrom: '',
      releaseDate: getTodayDate(),
      megaFileUrl: ''
    };
    selectedFile = null;
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
      
      {#if errorMessage}
        <div class="error-message">{errorMessage}</div>
      {/if}
      
      {#if successMessage}
        <div class="success-message">{successMessage}</div>
      {/if}

      <form onsubmit={addBook}>
        <!-- Upload Mode Toggle -->
        <fieldset class="form-group">
          <legend class="field-label">Upload Method</legend>
          <div class="upload-mode-toggle">
            <label class="toggle-option">
              <input type="radio" bind:group={useAutoUpload} value={true} />
              <span>Automatic MEGA Upload</span>
            </label>
            <label class="toggle-option">
              <input type="radio" bind:group={useAutoUpload} value={false} />
              <span>Manual MEGA Link</span>
            </label>
          </div>
        </fieldset>

        {#if useAutoUpload}
          <!-- File Upload (automatic mode) -->
          <div class="form-group">
            <label class="field-label" for="file-upload">PDF File *</label>
            <input
              id="file-upload"
              type="file"
              accept=".pdf"
              onchange={handleFileChange}
              required
            />
            <p class="field-hint">
              Select the PDF file to upload. It will be automatically uploaded to MEGA
              and the share link will be saved to Firebase.
            </p>
            {#if selectedFile}
              <div class="file-info">
                <strong>Selected:</strong> {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </div>
            {/if}
          </div>
        {:else}
          <!-- MEGA link (manual mode) -->
          <div class="form-group">
            <label class="field-label" for="mega-url">MEGA link *</label>
            <input
              id="mega-url"
              type="url"
              placeholder="https://mega.nz/file/XXXXXXXX#key"
              bind:value={bookForm.megaFileUrl}
              required
            />
            <p class="field-hint">
              Upload the PDF to your MEGA account, choose <strong>Share &rarr; Copy link</strong>
              (the link must include the decryption key after <code>#</code>), then paste it here.
              This is saved as <code>megaFileUrl</code> and is what the mobile app opens.
            </p>
          </div>
        {/if}

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

        <!-- Form Actions -->
        <div class="form-actions">
          <button type="button" class="cancel-btn" onclick={resetForm}>Reset</button>
          <button type="submit" class="submit-btn" disabled={saving || uploading}>
            {uploading ? 'Uploading to MEGA...' : (saving ? 'Saving...' : 'Save Book')}
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
    margin-bottom: 6px;
    font-weight: 600;
    color: #333;
  }

  fieldset {
    border: none;
    padding: 0;
    margin: 0;
  }

  legend {
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

  .upload-mode-toggle {
    display: flex;
    gap: 20px;
    margin-top: 8px;
  }

  .toggle-option {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .toggle-option input[type="radio"] {
    margin: 0;
  }

  .file-info {
    margin-top: 8px;
    padding: 8px 12px;
    background: #e7f3ff;
    border-radius: 4px;
    font-size: 14px;
    color: #0066cc;
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
