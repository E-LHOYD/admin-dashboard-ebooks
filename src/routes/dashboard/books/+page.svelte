<script>
  import { auth, db } from '$lib/firebase';
  import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, orderBy } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';

  // Reactive state variables
  let books = $state([]);
  let loading = $state(true);
  let editingBook = $state(null);

  // Helper function to get today's date in YYYY-MM-DD format
  function getTodayDate() {
    return new Date().toISOString().split('T')[0];
  }

  // Book form data
  let bookForm = $state({
    title: '',
    author: '',
    detail: '',
    subject: '',
    downloadedFrom: '',
    releaseDate: getTodayDate()
  });

  // Load books data
  async function loadBooks() {
    try {
      const booksQuery = query(collection(db, 'books'), orderBy('title'));
      const booksSnapshot = await getDocs(booksQuery);
      books = booksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loading = false;
    } catch (error) {
      console.error('Error loading books:', error);
      loading = false;
    }
  }


  // Edit book
  function editBook(book) {
    editingBook = book;
    bookForm = { ...book };
  }

  // Update book
  async function updateBook() {
    try {
      await updateDoc(doc(db, 'books', editingBook.id), bookForm);
      editingBook = null;
      bookForm = {
        title: '',
        author: '',
        detail: '',
        subject: '',
        downloadedFrom: '',
        releaseDate: getTodayDate()
      };
      await loadBooks(); // Refresh data
    } catch (error) {
      console.error('Error updating book:', error);
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
              <th>Downloaded From</th>
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
                <td>{book.downloadedFrom || '-'}</td>
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

</div>

<style>
  @import '../style.css';

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
