<script>
  import Logo from '$lib/components/Logo.svelte';
  import { auth, db } from '$lib/firebase';
  import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, orderBy } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { DEFAULT_SUBJECTS } from '$lib/subjects';
  import { sortRows, sortIndicator, ariaSort } from '$lib/sortTable';

  // Reactive state variables
  let programs = $state([]);
  let subjects = $state([]);
  let loading = $state(true);
  let showForm = $state(false);
  let editingProgram = $state(null);
  let searchQuery = $state('');
  let typeFilter = $state('');

  // Sorting
  let sortKey = $state('');
  let sortDir = $state('asc');

  const SORT_COLUMNS = [
    { key: 'name', label: 'Program Name', value: (p) => p.name },
    { key: 'type', label: 'Type', value: (p) => p.type === 'shs' ? 'Senior High' : 'College' },
    { key: 'subjects', label: 'Matched Subjects', value: (p) => p.subjects?.join(', ') || '' },
    { key: 'createdAt', label: 'Created At', value: (p) => p.createdAt }
  ];

  function toggleSort(key) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      return;
    }
    sortKey = key;
    sortDir = 'asc';
  }

  let filteredPrograms = $derived.by(() => {
    let result = programs.filter(program => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const name = program.name?.toLowerCase() || '';
        const subjects = program.subjects?.join(', ').toLowerCase() || '';
        
        const matchesSearch = name.includes(query) || subjects.includes(query);
        if (!matchesSearch) return false;
      }

      // Type filter
      if (typeFilter && program.type !== typeFilter) {
        return false;
      }

      return true;
    });

    // Apply sorting
    const column = SORT_COLUMNS.find((c) => c.key === sortKey);
    return column ? sortRows(result, column.value, sortDir) : result;
  });

  function resetFilters() {
    searchQuery = '';
    typeFilter = '';
  }

  // Program form data
  let programForm = $state({
    name: '',
    type: 'shs', // 'shs' or 'college'
    subjects: []
  });

  // Load programs data
  async function loadPrograms() {
    try {
      const programsQuery = query(collection(db, 'programMappings'), orderBy('name'));
      const programsSnapshot = await getDocs(programsQuery);
      programs = programsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Always reseed with correct programs on first load
      if (programs.length === 0 || programs.some(p => !p.type)) {
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
    // Delete all existing programs first
    const snapshot = await getDocs(collection(db, 'programMappings'));
    for (const doc of snapshot.docs) {
      await deleteDoc(doc.ref);
    }

    const defaultPrograms = [
      // Senior high strands
      { name: 'STEM', type: 'shs', subjects: ['Math', 'Science', 'Computer', 'English'] },
      { name: 'ABM', type: 'shs', subjects: ['Business', 'Math', 'English'] },
      { name: 'HUMSS', type: 'shs', subjects: ['Literature', 'English', 'Filipino', 'Arts'] },
      { name: 'GAS', type: 'shs', subjects: ['English', 'Filipino', 'Math', 'Science', 'Literature'] },
      { name: 'TVL', type: 'shs', subjects: ['Computer', 'Business', 'Health'] },
      { name: 'ICT - ANIMATION', type: 'shs', subjects: ['Computer', 'Arts', 'English', 'Math'] },
      { name: 'ICT', type: 'shs', subjects: ['Computer', 'Math', 'English'] },
      // College courses
      { name: 'BSCS', type: 'college', subjects: ['Computer', 'Math', 'English'] },
      { name: 'BSIT', type: 'college', subjects: ['Computer', 'Math', 'English'] },
      { name: 'BSBA', type: 'college', subjects: ['Business', 'Math', 'English'] },
      { name: 'BSIS', type: 'college', subjects: ['Computer', 'Business', 'Math'] }
    ];

    for (const program of defaultPrograms) {
      await addDoc(collection(db, 'programMappings'), {
        name: program.name,
        type: program.type,
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
        type: programForm.type,
        subjects: programForm.subjects,
        createdAt: new Date().toISOString()
      });
      programForm = { name: '', type: 'shs', subjects: [] };
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
        type: programForm.type,
        subjects: programForm.subjects
      });
      editingProgram = null;
      programForm = { name: '', type: 'shs', subjects: [] };
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
      <div class="brand-line"><Logo /></div>
      <h1>Programs Mapping</h1>
      <nav class="breadcrumb">
        <a href="/dashboard">Dashboard</a> / Programs Mapping
      </nav>
    </div>
    <div class="header-actions">
      <button class="dashboard-btn" onclick={() => goto('/dashboard')}>
        Return to Dashboard
      </button>
      <button class="register-btn" onclick={() => { editingProgram = null; programForm = { name: '', type: 'shs', subjects: [] }; showForm = true; }}>
        Add Program
      </button>
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  {#if loading}
    <div class="loading">Loading programs...</div>
  {:else}
    <!-- Filters Section -->
    <section class="filters-section">
      <div class="filters-container">
        <div class="search-group">
          <label for="programSearchInput">Search</label>
          <input 
            id="programSearchInput" 
            type="text" 
            placeholder="Search program name" 
            bind:value={searchQuery}
          />
        </div>
        
        <div class="filter-group">
          <label for="programTypeFilter">Type</label>
          <select id="programTypeFilter" bind:value={typeFilter}>
            <option value="">All Types</option>
            <option value="shs">Senior High</option>
            <option value="college">College</option>
          </select>
        </div>

        <div class="filter-actions">
          <button class="reset-filters-btn" onclick={resetFilters}>Reset Filters</button>
          <span class="results-count">Showing {filteredPrograms.length} of {programs.length} programs</span>
        </div>
      </div>
    </section>

    <!-- Programs Table -->
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
            {#each filteredPrograms as program, index}
              <tr>
                <td>{index + 1}</td>
                <td>{program.name}</td>
                <td>{program.type === 'shs' ? 'Senior High' : 'College'}</td>
                <td>{program.subjects ? program.subjects.join(', ') : 'None'}</td>
                <td>{new Date(program.createdAt).toLocaleDateString()}</td>
                <td>
                  <button class="table-btn edit-btn" onclick={() => editProgram(program)}>Edit</button>
                  <button class="table-btn delete-btn" onclick={() => deleteProgram(program.id)}>Delete</button>
                </td>
              </tr>
            {/each}
            {#if filteredPrograms.length === 0}
              <tr>
                <td colspan="6" class="empty-row">No programs found. Click "Add Program" to create mappings.</td>
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
          <div class="form-section">
            <h4>Program Information</h4>
            <div class="form-grid">
              <div>
                <label for="programName">Program Name *</label>
                <input id="programName" type="text" placeholder="e.g., STEM, ABM, BSCS, BSIT" bind:value={programForm.name} required>
              </div>
              <div>
                <label for="programType">Program Type *</label>
                <select id="programType" bind:value={programForm.type} required>
                  <option value="shs">Senior High Strand</option>
                  <option value="college">College Course</option>
                </select>
              </div>
            </div>
          </div>

          <div class="form-section">
            <h4>Matched Subjects *</h4>
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

          <div class="form-actions">
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

  /* Programs-specific column widths */
  .data-table th:nth-child(1) {
    width: 30px;
  }

  .data-table th:nth-child(2) {
    width: 150px;
  }

  .data-table th:nth-child(3) {
    width: 120px;
  }

  .data-table th:nth-child(4) {
    width: 200px;
  }

  .data-table th:nth-child(5) {
    width: 120px;
  }

  .data-table th:nth-child(6) {
    width: 80px;
  }

  .subjects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
    margin-top: 10px;
  }

  .subject-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background 0.2s;
  }

  .subject-checkbox:hover {
    background: var(--surface-alt);
  }

  .subject-checkbox input {
    cursor: pointer;
  }

  .subject-checkbox span {
    font-size: 0.875rem;
    color: var(--text-body);
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

  .form-section input,
  .form-section select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ced4da;
    border-radius: 4px;
    font-size: 0.875rem;
  }

  .form-section input:focus,
  .form-section select:focus {
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
