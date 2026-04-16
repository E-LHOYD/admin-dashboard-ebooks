<script>
  import { auth, db, storage } from '$lib/firebase';
  import { collection, addDoc } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
  import { goto } from '$app/navigation';

  // Reactive state variables
  let uploading = $state(false);
  let uploadProgress = $state(0);
  let errorMessage = $state('');
  let successMessage = $state('');

  // Book form data
  let bookForm = $state({
    title: '',
    author: '',
    detail: '',
    subject: '',
    downloadedFrom: '',
    releaseDate: new Date().toISOString().split('T')[0]
  });

  // File handling
  let selectedFile = $state(null);
  let fileInput = $state();

  // Helper function to get today's date
  function getTodayDate() {
    return new Date().toISOString().split('T')[0];
  }

  // Handle file selection
  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['application/pdf', 'application/epub+zip', 'text/plain'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(pdf|epub|txt)$/i)) {
      errorMessage = 'Please select a valid file type (PDF, EPUB, or TXT)';
      return;
    }

    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (file.size > maxSize) {
      errorMessage = 'File size must be less than 50MB';
      return;
    }

    selectedFile = file;
    errorMessage = '';
  }

  // Upload file to Firebase Storage
  async function uploadFile() {
    console.log('📁 Starting file upload process...');
    
    if (!selectedFile) {
      console.log('❌ No file selected for upload');
      errorMessage = 'Please select a file to upload';
      return null;
    }

    console.log('📁 File details:', {
      name: selectedFile.name,
      size: selectedFile.size,
      type: selectedFile.type
    });

    uploading = true;
    uploadProgress = 0;

    try {
      console.log('🗂️ Creating storage reference...');
      // Create a reference to the file location
      const storageRef = ref(storage, `books/${Date.now()}_${selectedFile.name}`);
      console.log('🗂️ Storage ref created:', storageRef);
      
      console.log('⬆️ Starting upload to Firebase Storage...');
      // Upload the file
      const snapshot = await uploadBytes(storageRef, selectedFile);
      console.log('✅ Upload completed, snapshot:', snapshot);
      
      console.log('🔗 Getting download URL...');
      // Get the download URL
      const fileUrl = await getDownloadURL(snapshot.ref);
      console.log('✅ Download URL obtained:', fileUrl);
      
      uploading = false;
      uploadProgress = 100;
      return fileUrl;
    } catch (error) {
      uploading = false;
      console.error('❌ Storage upload error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      errorMessage = `File upload failed: ${error.message}`;
      return null;
    }
  }


  // Add new book with text information only
  async function addBook(event) {
    event.preventDefault();
    console.log('=== BOOK SAVE START ===');
    
    // Validate form
    if (!bookForm.title || !bookForm.author || !bookForm.subject) {
      console.log('❌ Form validation failed');
      errorMessage = 'Please fill in all required fields';
      return;
    }
    console.log('✅ Form validation passed');

    console.log(' Checking authentication...');
    console.log('Auth state:', auth.currentUser ? 'User authenticated' : 'No user');
    console.log('User email:', auth.currentUser?.email);
    
    // Check authentication
    if (!auth.currentUser) {
      console.error('❌ User not authenticated');
      errorMessage = 'You must be logged in to upload books';
      return;
    }
    console.log('✅ User authenticated');

    console.log('💾 Preparing Firestore data...');
    // Add book data to Firestore
    const bookData = {
      title: bookForm.title,
      author: bookForm.author,
      detail: bookForm.detail,
      subject: bookForm.subject,
      downloadedFrom: bookForm.downloadedFrom,
      releaseDate: bookForm.releaseDate
    };

    console.log('📚 Book data to save:', bookData);
    console.log('🔥 Firestore DB instance:', db);
    
    try {
      console.log('💾 Saving to Firestore...');
      const docRef = await addDoc(collection(db, 'books'), bookData);
      console.log('✅ Book saved with ID:', docRef.id);
    } catch (firestoreError) {
      console.error('❌ Firestore error:', firestoreError);
      console.error('Error code:', firestoreError.code);
      console.error('Error message:', firestoreError.message);
      errorMessage = `Failed to save book: ${firestoreError.message}`;
      return;
    }

    console.log('🔄 Resetting form...');
    // Reset form
    resetForm();

    console.log('✅ Book saved successfully!');
    successMessage = 'Book saved successfully!';
    errorMessage = '';
    
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
      releaseDate: getTodayDate()
    };
    selectedFile = null;
    if (fileInput) fileInput.value = '';
    errorMessage = '';
    successMessage = '';
    uploadProgress = 0;
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

  // Format file size
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
        <!-- File Upload -->
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
                  <div>Click to select or drag and drop</div>
                  <div class="upload-hint">PDF, EPUB, or TXT (Max 50MB)</div>
                </div>
              {/if}
            </div>
          </label>
          <input 
            id="file-upload"
            type="file" 
            bind:this={fileInput}
            onchange={handleFileSelect}
            accept=".pdf,.epub,.txt,application/pdf,application/epub+zip,text/plain"
            class="file-input"
          />
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

        <!-- Upload Progress -->
        {#if uploading}
          <div class="upload-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: {uploadProgress}%"></div>
            </div>
            <div class="progress-text">Uploading... {uploadProgress}%</div>
          </div>
        {/if}

        <!-- Form Actions -->
        <div class="form-actions">
          <button type="button" class="cancel-btn" onclick={resetForm}>Reset</button>
          <button type="submit" class="submit-btn" disabled={uploading}>
            {uploading ? 'Saving...' : 'Save Book'}
          </button>
        </div>
      </form>
    </div>
  </section>
</div>

<style>
  @import '../style.css';

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

  .file-upload-label {
    display: block;
    cursor: pointer;
    margin-bottom: 20px;
  }

  .file-upload-area {
    border: 2px dashed #ddd;
    border-radius: 8px;
    padding: 40px 20px;
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

  .upload-icon {
    font-size: 3em;
    margin-bottom: 10px;
  }

  .upload-hint {
    font-size: 14px;
    color: #999;
    margin-top: 5px;
  }

  .file-info {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 15px;
    color: #333;
  }

  .file-icon {
    font-size: 2em;
  }

  .file-details {
    text-align: left;
  }

  .file-name {
    font-weight: 600;
    margin-bottom: 5px;
  }

  .file-size {
    font-size: 14px;
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

  .upload-progress {
    margin: 20px 0;
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background: #f1f1f1;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 10px;
  }

  .progress-fill {
    height: 100%;
    background: #007bff;
    transition: width 0.3s ease;
  }

  .progress-text {
    text-align: center;
    font-size: 14px;
    color: #666;
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
    
    .file-info {
      flex-direction: column;
      text-align: center;
    }
    
    .file-details {
      text-align: center;
    }
  }
</style>
