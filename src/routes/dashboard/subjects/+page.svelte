<script>
  import { auth, db } from '$lib/firebase';
  import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, orderBy } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { DEFAULT_SUBJECTS } from '$lib/subjects';

  // Reactive state variables
  let subjects = $state([]);
  let loading = $state(true);
  let showForm = $state(false);
  let editingSubject = $state(null);

  // Subject form data
  let subjectForm = $state({
    name: '',
    isActive: true
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
        isActive: subjectForm.isActive,
        createdAt: new Date().toISOString()
      });
      subjectForm = { name: '', isActive: true };
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
        name: subjectForm.name,
        isActive: subjectForm.isActive
      });
      editingSubject = null;
      subjectForm = { name: '', isActive: true };
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

  // Toggle subject active status
  async function toggleSubjectStatus(subject) {
    try {
      await updateDoc(doc(db, 'subjects', subject.id), {
        isActive: !subject.isActive
      });
      await loadSubjects(); // Refresh data
    } catch (error) {
      console.error('Error toggling subject status:', error);
    }
  }

  // Initialize default subjects manually
  async function initializeDefaultSubjectsManually() {
    if (!confirm('This will add the default subjects (Math, Science, Filipino, etc.) to the subjects list. Continue?')) {
      return;
    }

    try {
      for (const subjectName of DEFAULT_SUBJECTS) {
        // Check if subject already exists
        const existingSubject = subjects.find(s => s.name === subjectName);
        if (!existingSubject) {
          await addDoc(collection(db, 'subjects'), {
            name: subjectName,
            isActive: true,
            createdAt: new Date().toISOString()
          });
        }
      }
      await loadSubjects(); // Refresh data
      alert('Default subjects have been added successfully!');
    } catch (error) {
      console.error('Error initializing default subjects:', error);
      alert('Error adding default subjects: ' + error.message);
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
      <h1>Subjects Management</h1>
      <nav class="breadcrumb">
        <a href="/dashboard">Dashboard</a> / Subjects
      </nav>
    </div>
    <div class="header-actions">
      <button class="dashboard-btn" onclick={() => goto('/dashboard')}>
        Return to Dashboard
      </button>
      <button class="add-btn" onclick={() => { editingSubject = null; subjectForm = { name: '', isActive: true }; showForm = true; }}>
        Add Subject
      </button>
      <button class="init-btn" onclick={initializeDefaultSubjectsManually}>
        Initialize Default Subjects
      </button>
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  {#if loading}
    <div class="loading">Loading subjects...</div>
  {:else}
    <!-- Subjects Table -->
    <section class="table-section">
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Subject Name</th>
              <th>Status</th>
              <th>Created At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each subjects as subject, index}
              <tr>
                <td>{index + 1}</td>
                <td>{subject.name}</td>
                <td>
                  <span class="status-badge" class:active={subject.isActive} class:inactive={!subject.isActive}>
                    {subject.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{new Date(subject.createdAt).toLocaleDateString()}</td>
                <td>
                  <button class="table-btn edit-btn" onclick={() => editSubject(subject)}>Edit</button>
                  <button class="table-btn toggle-btn" onclick={() => toggleSubjectStatus(subject)}>
                    {subject.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button class="table-btn delete-btn" onclick={() => deleteSubject(subject.id)}>Delete</button>
                </td>
              </tr>
            {/each}
            {#if subjects.length === 0}
              <tr>
                <td colspan="5" class="empty-row">No subjects found. Click "Initialize Default Subjects" to add the standard subjects, or "Add Subject" to create custom ones.</td>
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
          <div class="form-group">
            <label for="subjectName">Subject Name *</label>
            <input 
              type="text" 
              id="subjectName" 
              placeholder="e.g., Mathematics, Computer Science" 
              bind:value={subjectForm.name} 
              required
            />
          </div>
          <div class="form-group">
            <label for="subjectStatus">Status</label>
            <select id="subjectStatus" bind:value={subjectForm.isActive}>
              <option value={true}>Active</option>
              <option value={false}>Inactive</option>
            </select>
          </div>
          <div class="modal-actions">
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

  .dashboard-btn {
    background: white;
    color: var(--brand);
    border: 2px solid var(--brand);
    padding: 10px 20px;
    border-radius: var(--radius);
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: bold;
  }

  .dashboard-btn:hover {
    background: var(--brand);
    color: white;
  }

  .add-btn {
    background: var(--brand);
    color: white;
    border: 2px solid var(--brand);
    padding: 10px 20px;
    border-radius: var(--radius);
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: bold;
  }

  .add-btn:hover {
    background: var(--brand-hover);
    border-color: var(--brand-hover);
  }

  .init-btn {
    background: #6c757d;
    color: white;
    border: 2px solid #6c757d;
    padding: 10px 20px;
    border-radius: var(--radius);
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: bold;
  }

  .init-btn:hover {
    background: #5a6268;
    border-color: #5a6268;
  }

  .logout-btn {
    background: #dc3545;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: var(--radius);
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: bold;
  }

  .logout-btn:hover {
    background: #c82333;
  }

  .subjects-container {
    padding: 20px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #e9ecef;
  }

  .header-content h1 {
    margin: 0 0 5px 0;
    color: var(--brand);
    font-size: 2rem;
  }

  .breadcrumb {
    font-size: 0.875rem;
    color: #6c757d;
  }

  .breadcrumb a {
    color: var(--brand);
    text-decoration: none;
  }

  .breadcrumb a:hover {
    text-decoration: underline;
  }

  .header-actions {
    display: flex;
    gap: 10px;
  }

  .loading {
    text-align: center;
    padding: 40px;
    font-size: 1.125rem;
    color: #6c757d;
  }

  .table-section {
    background: white;
    border-radius: var(--radius);
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    overflow: hidden;
  }

  .table-container {
    overflow-x: auto;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
  }

  .data-table th {
    background: var(--brand);
    color: white;
    padding: 15px;
    text-align: left;
    font-weight: 600;
  }

  .data-table td {
    padding: 12px 15px;
    border-bottom: 1px solid #dee2e6;
  }

  .data-table tr:hover {
    background: #f8f9fa;
  }

  .empty-row {
    text-align: center;
    padding: 40px;
    color: #6c757d;
    font-style: italic;
  }

  .status-badge {
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .status-badge.active {
    background: #28a745;
    color: white;
  }

  .status-badge.inactive {
    background: #6c757d;
    color: white;
  }

  .table-btn {
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    margin-right: 5px;
  }

  .edit-btn {
    background: #007bff;
    color: white;
  }

  .edit-btn:hover {
    background: #0056b3;
  }

  .toggle-btn {
    background: #ffc107;
    color: #212529;
  }

  .toggle-btn:hover {
    background: #e0a800;
  }

  .delete-btn {
    background: #dc3545;
    color: white;
  }

  .delete-btn:hover {
    background: #c82333;
  }

  /* Modal styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: white;
    padding: 30px;
    border-radius: var(--radius);
    width: 90%;
    max-width: 500px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .modal-content h3 {
    margin: 0 0 20px 0;
    color: var(--brand);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #6c757d;
  }

  .close-btn:hover {
    color: #343a40;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block;
    margin-bottom: 8px;
    font-weight: 600;
    color: #343a40;
  }

  .form-group input,
  .form-group select {
    width: 100%;
    padding: 10px;
    border: 1px solid #ced4da;
    border-radius: 4px;
    font-size: 1rem;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(3, 48, 71, 0.1);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 25px;
  }

  .cancel-btn {
    background: #6c757d;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
  }

  .cancel-btn:hover {
    background: #5a6268;
  }

  .submit-btn {
    background: var(--brand);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
  }

  .submit-btn:hover {
    background: var(--brand-hover);
  }
</style>
