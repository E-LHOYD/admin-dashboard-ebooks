<script>
  import Logo from '$lib/components/Logo.svelte';
  import { auth, db } from '$lib/firebase';
  import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, orderBy } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { DEFAULT_SUBJECTS } from '$lib/subjects';
  import { DEPARTMENTS } from '$lib/users';
  import { sortRows, sortIndicator, ariaSort } from '$lib/sortTable';

  // Reactive state variables
  let departmentMappings = $state([]);
  let subjects = $state([]);
  let loading = $state(true);
  let showForm = $state(false);
  let editingMapping = $state(null);
  let searchQuery = $state('');

  // Sorting
  let sortKey = $state('');
  let sortDir = $state('asc');

  const SORT_COLUMNS = [
    { key: 'department', label: 'Department', value: (m) => m.department },
    { key: 'subjects', label: 'Matched Subjects', value: (m) => m.subjects?.join(', ') || '' },
    { key: 'createdAt', label: 'Created At', value: (m) => m.createdAt }
  ];

  function toggleSort(key) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      return;
    }
    sortKey = key;
    sortDir = 'asc';
  }

  let filteredMappings = $derived.by(() => {
    let result = departmentMappings.filter(mapping => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const department = mapping.department?.toLowerCase() || '';
        const subjects = mapping.subjects?.join(', ').toLowerCase() || '';
        
        const matchesSearch = department.includes(query) || subjects.includes(query);
        if (!matchesSearch) return false;
      }

      return true;
    });

    // Apply sorting
    const column = SORT_COLUMNS.find((c) => c.key === sortKey);
    return column ? sortRows(result, column.value, sortDir) : result;
  });

  function resetFilters() {
    searchQuery = '';
  }

  // Department mapping form data
  let mappingForm = $state({
    department: '',
    subjects: []
  });

  // Load department mappings data
  async function loadDepartmentMappings() {
    try {
      const mappingsQuery = query(collection(db, 'departmentMappings'), orderBy('department'));
      const mappingsSnapshot = await getDocs(mappingsQuery);
      departmentMappings = mappingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Seed default department mappings if none exist
      if (departmentMappings.length === 0) {
        await seedDefaultDepartmentMappings();
        await loadDepartmentMappings(); // Reload after seeding
      }
      
      loading = false;
    } catch (error) {
      console.error('Error loading department mappings:', error);
      loading = false;
    }
  }

  // Seed default department mappings
  async function seedDefaultDepartmentMappings() {
    const defaultMappings = [
      { department: 'Filipino', subjects: ['Filipino', 'Literature'] },
      { department: 'Social Science', subjects: ['Literature', 'English', 'Filipino', 'Arts'] },
      { department: 'ICT', subjects: ['Computer', 'Math', 'English'] },
      { department: 'Animation', subjects: ['Arts', 'Computer', 'Music'] },
      { department: 'P.E.', subjects: ['Physical Education', 'Health'] },
      { department: 'ABM', subjects: ['Business', 'Math', 'English'] },
      { department: 'English', subjects: ['English', 'Literature'] },
      { department: 'STEM', subjects: ['Math', 'Science', 'Computer', 'English'] },
      { department: 'Science', subjects: ['Science', 'Math'] },
      { department: 'Math', subjects: ['Math', 'Computer'] },
      { department: 'Business', subjects: ['Business', 'Math', 'English'] }
    ];

    for (const mapping of defaultMappings) {
      await addDoc(collection(db, 'departmentMappings'), {
        department: mapping.department,
        subjects: mapping.subjects,
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

  // Add new department mapping
  async function addDepartmentMapping() {
    try {
      await addDoc(collection(db, 'departmentMappings'), {
        department: mappingForm.department,
        subjects: mappingForm.subjects,
        createdAt: new Date().toISOString()
      });
      mappingForm = { department: '', subjects: [] };
      showForm = false;
      await loadDepartmentMappings(); // Refresh data
    } catch (error) {
      console.error('Error adding department mapping:', error);
    }
  }

  // Edit department mapping
  function editMapping(mapping) {
    editingMapping = mapping;
    mappingForm = { ...mapping };
    showForm = true;
  }

  // Update department mapping
  async function updateDepartmentMapping() {
    try {
      await updateDoc(doc(db, 'departmentMappings', editingMapping.id), {
        department: mappingForm.department,
        subjects: mappingForm.subjects
      });
      editingMapping = null;
      mappingForm = { department: '', subjects: [] };
      showForm = false;
      await loadDepartmentMappings(); // Refresh data
    } catch (error) {
      console.error('Error updating department mapping:', error);
    }
  }

  // Delete department mapping
  async function deleteDepartmentMapping(mappingId) {
    if (!confirm('Are you sure you want to delete this department mapping?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'departmentMappings', mappingId));
      await loadDepartmentMappings(); // Refresh data
    } catch (error) {
      console.error('Error deleting department mapping:', error);
    }
  }

  // Toggle subject selection
  function toggleSubject(subject) {
    if (mappingForm.subjects.includes(subject)) {
      mappingForm.subjects = mappingForm.subjects.filter(s => s !== subject);
    } else {
      mappingForm.subjects = [...mappingForm.subjects, subject];
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
      editingMapping = null;
    }
  }

  // Handle Escape key for modal
  function handleKeydown(event) {
    if (event.key === 'Escape' && showForm) {
      showForm = false;
      editingMapping = null;
    }
  }

  // Initialize on component mount
  loadSubjects();
  loadDepartmentMappings();
</script>

<div class="departments-container">
  <!-- Header -->
  <header class="page-header">
    <div class="header-content">
      <div class="brand-line"><Logo /></div>
      <h1>Departments Mapping</h1>
      <nav class="breadcrumb">
        <a href="/dashboard">Dashboard</a> / Departments Mapping
      </nav>
    </div>
    <div class="header-actions">
      <button class="dashboard-btn" onclick={() => goto('/dashboard')}>
        Return to Dashboard
      </button>
      <button class="register-btn" onclick={() => { editingMapping = null; mappingForm = { department: '', subjects: [] }; showForm = true; }}>
        Add Department
      </button>
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  {#if loading}
    <div class="loading">Loading department mappings...</div>
  {:else}
    <!-- Filters Section -->
    <section class="filters-section">
      <div class="filters-container">
        <div class="search-group">
          <label for="departmentSearchInput">Search</label>
          <input 
            id="departmentSearchInput" 
            type="text" 
            placeholder="Search department name" 
            bind:value={searchQuery}
          />
        </div>

        <div class="filter-actions">
          <span class="results-count">Showing {filteredMappings.length} of {departmentMappings.length} department mappings</span>
        </div>
      </div>
    </section>

    <!-- Departments Mapping Table -->
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
            {#each filteredMappings as mapping, index}
              <tr>
                <td>{index + 1}</td>
                <td>{mapping.department}</td>
                <td>{mapping.subjects ? mapping.subjects.join(', ') : 'None'}</td>
                <td>{new Date(mapping.createdAt).toLocaleDateString()}</td>
                <td>
                  <button class="table-btn edit-btn" onclick={() => editMapping(mapping)}>Edit</button>
                  <button class="table-btn delete-btn" onclick={() => deleteDepartmentMapping(mapping.id)}>Delete</button>
                </td>
              </tr>
            {/each}
            {#if filteredMappings.length === 0}
              <tr>
                <td colspan="5" class="empty-row">No department mappings found. Click "Add Department" to create custom mappings for teacher departments.</td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <!-- Add/Edit Department Mapping Modal -->
  {#if showForm}
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1" onclick={handleOverlayClick} onkeydown={handleKeydown}>
      <div class="modal-content" role="document">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 id="modal-title">{editingMapping ? 'Edit Department Mapping' : 'Add New Department Mapping'}</h3>
          <button type="button" class="close-btn" onclick={() => { showForm = false; editingMapping = null; }} aria-label="Close modal">&times;</button>
        </div>
        <form onsubmit={(e) => { e.preventDefault(); editingMapping ? updateDepartmentMapping() : addDepartmentMapping(); }}>
          <div class="form-section">
            <h4>Department Information</h4>
            <div class="form-grid">
              <div>
                <label for="department">Department *</label>
                <select id="department" bind:value={mappingForm.department} required>
                  <option value="">Select Department</option>
                  {#each DEPARTMENTS as dept}
                    <option value={dept}>{dept}</option>
                  {/each}
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
                    checked={mappingForm.subjects.includes(subject)}
                    onchange={() => toggleSubject(subject)}
                  />
                  <span>{subject}</span>
                </label>
              {/each}
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="cancel-btn" onclick={() => { showForm = false; editingMapping = null; }}>Cancel</button>
            <button type="submit" class="submit-btn">{editingMapping ? 'Update Department' : 'Add Department'}</button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>

<style>
  @import '../style.css';

  /* Departments-specific column widths */
  .data-table th:nth-child(1) {
    width: 30px;
  }

  .data-table th:nth-child(2) {
    width: 150px;
  }

  .data-table th:nth-child(3) {
    width: 200px;
  }

  .data-table th:nth-child(4) {
    width: 120px;
  }

  .data-table th:nth-child(5) {
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
