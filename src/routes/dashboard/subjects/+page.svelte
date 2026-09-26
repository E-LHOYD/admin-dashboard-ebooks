<script>
  import Logo from '$lib/components/Logo.svelte';
  import { auth, db } from '$lib/firebase';
  import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, orderBy } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { sortRows, sortIndicator, ariaSort } from '$lib/sortTable';

  // Reactive state variables
  let subjects = $state([]);
  let loading = $state(true);
  let showForm = $state(false);
  let editingSubject = $state(null);

  // Sorting
  let sortKey = $state('');
  let sortDir = $state('asc');

  const SORT_COLUMNS = [
    { key: 'name', label: 'Subject Name', value: (s) => s.name },
    { key: 'createdAt', label: 'Created At', value: (s) => s.createdAt }
  ];

  function toggleSort(key) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      return;
    }
    sortKey = key;
    sortDir = 'asc';
  }

  let sortedSubjects = $derived.by(() => {
    const column = SORT_COLUMNS.find((c) => c.key === sortKey);
    return column ? sortRows(subjects, column.value, sortDir) : subjects;
  });

  // Search state
  let searchQuery = $state('');

  let filteredSubjects = $derived.by(() => {
    return subjects.filter(subject => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const name = subject.name?.toLowerCase() || '';
        
        const matchesSearch = name.includes(query);
        if (!matchesSearch) return false;
      }

      return true;
    });
  });

  // Subject form data
  let subjectForm = $state({
    name: ''
  });

  // Load subjects data
  async function loadSubjects() {
    try {
      const subjectsQuery = query(collection(db, 'subjects'), orderBy('name'));
      const subjectsSnapshot = await getDocs(subjectsQuery);
      subjects = subjectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loading = false;
    } catch (error) {
      console.error('Error loading subjects:', error);
      loading = false;
    }
  }

  // Add new subject
  async function addSubject() {
    try {
      await addDoc(collection(db, 'subjects'), {
        name: subjectForm.name,
        createdAt: new Date().toISOString()
      });
      subjectForm = { name: '' };
      showForm = false;
      await loadSubjects(); // Refresh data
    } catch (error) {
      console.error('Error adding subject:', error);
    }
  }

  // Edit subject
  function editSubject(subject) {
    editingSubject = subject;
    subjectForm = { ...subject };
    showForm = true;
  }

  // Update subject
  async function updateSubject() {
    try {
      await updateDoc(doc(db, 'subjects', editingSubject.id), {
        name: subjectForm.name
      });
      editingSubject = null;
      subjectForm = { name: '' };
      showForm = false;
      await loadSubjects(); // Refresh data
    } catch (error) {
      console.error('Error updating subject:', error);
    }
  }

  // Delete subject
  async function deleteSubject(subjectId) {
    if (!confirm('Are you sure you want to delete this subject?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'subjects', subjectId));
      await loadSubjects(); // Refresh data
    } catch (error) {
      console.error('Error deleting subject:', error);
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

  // Handle modal overlay click
  function handleOverlayClick(event) {
    if (event.target === event.currentTarget) {
      showForm = false;
      editingSubject = null;
    }
  }

  // Handle Escape key for modal
  function handleKeydown(event) {
    if (event.key === 'Escape' && showForm) {
      showForm = false;
      editingSubject = null;
    }
  }

  // Initialize on component mount
  loadSubjects();
</script>

<div class="subjects-container">
  <!-- Header -->
  <header class="page-header">
    <div class="header-content">
      <div class="brand-line"><Logo /></div>
      <h1>Subjects Management</h1>
      <nav class="breadcrumb">
        <a href="/dashboard">Dashboard</a> / Subjects
      </nav>
    </div>
    <div class="header-actions">
      <button class="dashboard-btn" onclick={() => goto('/dashboard')}>
        Return to Dashboard
      </button>
      <button class="register-btn" onclick={() => { editingSubject = null; subjectForm = { name: '' }; showForm = true; }}>
        Add Subject
      </button>
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  {#if loading}
    <div class="loading">Loading subjects...</div>
  {:else}
    <!-- Filters Section -->
    <section class="filters-section">
      <div class="filters-container">
        <div class="search-group">
          <label for="subjectSearchInput">Search</label>
          <input 
            id="subjectSearchInput" 
            type="text" 
            placeholder="Search subject name" 
            bind:value={searchQuery}
          />
        </div>

        <div class="filter-actions">
          <span class="results-count">Showing {filteredSubjects.length} of {subjects.length} subjects</span>
        </div>
      </div>
    </section>

    <!-- Subjects Table -->
    <section class="table-section">
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
            {#each filteredSubjects as subject, index}
              <tr>
                <td>{index + 1}</td>
                <td>{subject.name}</td>
                <td>{new Date(subject.createdAt).toLocaleDateString()}</td>
                <td>
                  <button class="table-btn edit-btn" onclick={() => editSubject(subject)}>Edit</button>
                  <button class="table-btn delete-btn" onclick={() => deleteSubject(subject.id)}>Delete</button>
                </td>
              </tr>
            {/each}
            {#if filteredSubjects.length === 0}
              <tr>
                <td colspan="4" class="empty-row">No subjects found. Click "Add Subject" to create custom ones.</td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <!-- Add/Edit Subject Modal -->
  {#if showForm}
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1" onclick={handleOverlayClick} onkeydown={handleKeydown}>
      <div class="modal-content" role="document">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 id="modal-title">{editingSubject ? 'Edit Subject' : 'Add New Subject'}</h3>
          <button type="button" class="close-btn" onclick={() => { showForm = false; editingSubject = null; }} aria-label="Close modal">&times;</button>
        </div>
        <form onsubmit={(e) => { e.preventDefault(); editingSubject ? updateSubject() : addSubject(); }}>
          <div class="form-section">
            <h4>Subject Information</h4>
            <div class="form-grid">
              <div>
                <label for="subjectName">Subject Name *</label>
                <input id="subjectName" type="text" placeholder="e.g., Mathematics, Computer Science" bind:value={subjectForm.name} required>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="cancel-btn" onclick={() => { showForm = false; editingSubject = null; }}>Cancel</button>
            <button type="submit" class="submit-btn">{editingSubject ? 'Update Subject' : 'Add Subject'}</button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>

<style>
  @import '../style.css';

  /* Subjects-specific column widths */
  .data-table th:nth-child(1) {
    width: 30px;
  }

  .data-table th:nth-child(2) {
    width: 200px;
  }

  .data-table th:nth-child(3) {
    width: 120px;
  }

  .data-table th:nth-child(4) {
    width: 80px;
  }

  .form-section {
    margin-bottom: 20px;
    padding-bottom: 20px;
    border-bottom: 1px solid #e9ecef;
  }

  .form-section:last-child {
    border-bottom: none;
  }

  .form-section h4 {
    margin: 0 0 15px 0;
    color: var(--brand);
    font-size: 1rem;
    font-weight: 600;
  }

  .form-section label {
    display: block;
    margin-bottom: 5px;
    font-weight: 500;
    font-size: 0.875rem;
    color: #343a40;
  }

  .form-section input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ced4da;
    border-radius: 4px;
    font-size: 0.875rem;
  }

  .form-section input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(3, 48, 71, 0.1);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #666;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: #f8f9fa;
    color: #333;
  }

  .close-btn:focus {
    outline: 2px solid #007bff;
    outline-offset: 2px;
  }
</style>
