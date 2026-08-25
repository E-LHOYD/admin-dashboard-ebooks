<script>
  import { auth, db } from '$lib/firebase';
  import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, orderBy } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { DEFAULT_SUBJECTS } from '$lib/subjects';

  // Reactive state variables
  let programs = $state([]);
  let subjects = $state([]);
  let loading = $state(true);
  let showForm = $state(false);
  let editingProgram = $state(null);

  // Program form data
  let programForm = $state({
    name: '',
    subjects: []
  });

  // Load programs data
  async function loadPrograms() {
    try {
      const programsQuery = query(collection(db, 'programMappings'), orderBy('name'));
      const programsSnapshot = await getDocs(programsQuery);
      programs = programsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Seed default programs if none exist
      if (programs.length === 0) {
        await seedDefaultPrograms();
        await loadPrograms(); // Reload after seeding
      }
      
      loading = false;
    } catch (error) {
      console.error('Error loading programs:', error);
      loading = false;
    }
  }

  // Seed default program mappings from existing TRACK_SUBJECTS
  async function seedDefaultPrograms() {
    const defaultPrograms = [
      // Senior high strands
      { name: 'STEM', subjects: ['Math', 'Science', 'Computer', 'English'] },
      { name: 'ABM', subjects: ['Business', 'Math', 'English'] },
      { name: 'HUMSS', subjects: ['Literature', 'English', 'Filipino', 'Arts'] },
      { name: 'GAS', subjects: ['English', 'Filipino', 'Math', 'Science', 'Literature'] },
      { name: 'TVL', subjects: ['Computer', 'Business', 'Health'] },
      { name: 'ARTS & DESIGN', subjects: ['Arts', 'Music', 'Literature'] },
      // College courses
      { name: 'BSCS', subjects: ['Computer', 'Math', 'English'] },
      { name: 'BSIT', subjects: ['Computer', 'Math', 'English'] },
      { name: 'BSIS', subjects: ['Computer', 'Business', 'Math'] },
      { name: 'BSBA', subjects: ['Business', 'Math', 'English'] }
    ];

    for (const program of defaultPrograms) {
      await addDoc(collection(db, 'programMappings'), {
        name: program.name,
        subjects: program.subjects,
        createdAt: new Date().toISOString()
      });
    }
  }

  // Load subjects
  async function loadSubjects() {
    try {
      const subjectsQuery = query(collection(db, 'subjects'), orderBy('name'));
      const subjectsSnapshot = await getDocs(subjectsQuery);
      subjects = subjectsSnapshot.docs.map(doc => doc.data().name);
      
      // If no subjects in Firestore, use defaults
      if (subjects.length === 0) {
        subjects = DEFAULT_SUBJECTS;
      }
    } catch (error) {
      console.error('Error loading subjects:', error);
      subjects = DEFAULT_SUBJECTS;
    }
  }

  // Add new program
  async function addProgram() {
    try {
      await addDoc(collection(db, 'programMappings'), {
        name: programForm.name,
        subjects: programForm.subjects,
        createdAt: new Date().toISOString()
      });
      programForm = { name: '', subjects: [] };
      showForm = false;
      await loadPrograms(); // Refresh data
    } catch (error) {
      console.error('Error adding program:', error);
    }
  }

  // Edit program
  function editProgram(program) {
    editingProgram = program;
    programForm = { ...program };
    showForm = true;
  }

  // Update program
  async function updateProgram() {
    try {
      await updateDoc(doc(db, 'programMappings', editingProgram.id), {
        name: programForm.name,
        subjects: programForm.subjects
      });
      editingProgram = null;
      programForm = { name: '', subjects: [] };
      showForm = false;
      await loadPrograms(); // Refresh data
    } catch (error) {
      console.error('Error updating program:', error);
    }
  }

  // Delete program
  async function deleteProgram(programId) {
    if (!confirm('Are you sure you want to delete this program mapping?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'programMappings', programId));
      await loadPrograms(); // Refresh data
    } catch (error) {
      console.error('Error deleting program:', error);
    }
  }

  // Toggle subject selection
  function toggleSubject(subject) {
    if (programForm.subjects.includes(subject)) {
      programForm.subjects = programForm.subjects.filter(s => s !== subject);
    } else {
      programForm.subjects = [...programForm.subjects, subject];
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
      editingProgram = null;
    }
  }

  // Handle Escape key for modal
  function handleKeydown(event) {
    if (event.key === 'Escape' && showForm) {
      showForm = false;
      editingProgram = null;
    }
  }

  // Initialize on component mount
  loadSubjects();
  loadPrograms();
</script>

<div class="programs-container">
  <!-- Header -->
  <header class="page-header">
    <div class="header-content">
      <h1>Student Programs Management</h1>
      <nav class="breadcrumb">
        <a href="/dashboard">Dashboard</a> / Programs
      </nav>
    </div>
    <div class="header-actions">
      <button class="dashboard-btn" onclick={() => goto('/dashboard')}>
        Return to Dashboard
      </button>
      <button class="add-btn" onclick={() => { editingProgram = null; programForm = { name: '', subjects: [] }; showForm = true; }}>
        Add Program
      </button>
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  {#if loading}
    <div class="loading">Loading programs...</div>
  {:else}
    <!-- Programs Table -->
    <section class="table-section">
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Program Name</th>
              <th>Matched Subjects</th>
              <th>Created At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each programs as program, index}
              <tr>
                <td>{index + 1}</td>
                <td>{program.name}</td>
                <td>{program.subjects ? program.subjects.join(', ') : 'None'}</td>
                <td>{new Date(program.createdAt).toLocaleDateString()}</td>
                <td>
                  <button class="table-btn edit-btn" onclick={() => editProgram(program)}>Edit</button>
                  <button class="table-btn delete-btn" onclick={() => deleteProgram(program.id)}>Delete</button>
                </td>
              </tr>
            {/each}
            {#if programs.length === 0}
              <tr>
                <td colspan="5" class="empty-row">No program mappings found. Click "Add Program" to create custom mappings for student strands and courses.</td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <!-- Add/Edit Program Modal -->
  {#if showForm}
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1" onclick={handleOverlayClick} onkeydown={handleKeydown}>
      <div class="modal-content" role="document">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 id="modal-title">{editingProgram ? 'Edit Program' : 'Add New Program'}</h3>
          <button type="button" class="close-btn" onclick={() => { showForm = false; editingProgram = null; }} aria-label="Close modal">&times;</button>
        </div>
        <form onsubmit={(e) => { e.preventDefault(); editingProgram ? updateProgram() : addProgram(); }}>
          <div class="form-group">
            <label for="programName">Program Name *</label>
            <input 
              type="text" 
              id="programName" 
              placeholder="e.g., STEM, ABM, BSCS, BSIT" 
              bind:value={programForm.name} 
              required
            />
          </div>
          <div class="form-group">
            <label>Matched Subjects *</label>
            <div class="subjects-grid">
              {#each subjects as subject}
                <label class="subject-checkbox">
                  <input 
                    type="checkbox" 
                    checked={programForm.subjects.includes(subject)}
                    onchange={() => toggleSubject(subject)}
                  />
                  <span>{subject}</span>
                </label>
              {/each}
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="cancel-btn" onclick={() => { showForm = false; editingProgram = null; }}>Cancel</button>
            <button type="submit" class="submit-btn">{editingProgram ? 'Update Program' : 'Add Program'}</button>
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

  .programs-container {
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
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
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

  .subjects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
    max-height: 300px;
    overflow-y: auto;
    padding: 10px;
    border: 1px solid #ced4da;
    border-radius: 4px;
  }

  .subject-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 5px;
  }

  .subject-checkbox input {
    width: auto;
    cursor: pointer;
  }

  .subject-checkbox span {
    font-size: 0.9rem;
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
