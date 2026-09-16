<script>
  import Logo from '$lib/components/Logo.svelte';
  import { auth, db } from '$lib/firebase';
  import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
  import { signOut, deleteUser as deleteAuthUser } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { sortRows, sortIndicator, ariaSort } from '$lib/sortTable';
  import {
    hasRole,
    roleLabel,
    idNumberOf,
    fullName
  } from '$lib/users';

  // Reactive state variables
  let users = $state([]);
  let filteredUsers = $state([]);
  let loading = $state(true);
  let showForm = $state(false);
  let editingUser = $state(null);

  // Sorting
  let sortKey = $state('');
  let sortDir = $state('asc');

  const SORT_COLUMNS = [
    { key: 'idNumber', label: 'Employee #', value: (u) => idNumberOf(u) },
    { key: 'name', label: 'Name', value: (u) => fullName(u) },
    { key: 'username', label: 'Username', value: (u) => u.username },
    { key: 'email', label: 'Email', value: (u) => u.email },
    { key: 'department', label: 'Department', value: (u) => u.department || '' },
    {
      key: 'activity',
      label: 'Activity Status',
      value: (u) => u.activityStatus || 'Active'
    }
  ];

  function toggleSort(key) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      return;
    }
    sortKey = key;
    sortDir = 'asc';
  }

  let sortedUsers = $derived.by(() => {
    const column = SORT_COLUMNS.find((c) => c.key === sortKey);
    return column ? sortRows(filteredUsers, column.value, sortDir) : filteredUsers;
  });

  // Filter state
  let filters = $state({
    department: '',
    activityStatus: ''
  });

  // Search state
  let searchQuery = $state('');

  // Teacher form data
  let teacherForm = $state({
    firstName: '',
    middleName: '',
    surname: '',
    email: '',
    username: '',
    password: '',
    role: 'teacher',
    activityStatus: 'Active',
    employeeNumber: '',
    department: '',
    interests: []
  });

  // Load teachers data
  async function loadUsers() {
    try {
      const usersQuery = query(collection(db, 'users'), orderBy('surname'));
      const usersSnapshot = await getDocs(usersQuery);
      const allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Filter only teachers
      users = allUsers.filter(u => hasRole(u, 'teacher'));
      applyFilters();
      loading = false;
    } catch (error) {
      console.error('Error loading teachers:', error);
      loading = false;
    }
  }

  // Apply filters to teachers
  function applyFilters() {
    filteredUsers = users.filter(user => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const name = fullName(user)?.toLowerCase() || '';
        const idNumber = idNumberOf(user)?.toLowerCase() || '';
        const username = user.username?.toLowerCase() || '';
        const email = user.email?.toLowerCase() || '';

        const matchesSearch = 
          name.includes(query) ||
          idNumber.includes(query) ||
          username.includes(query) ||
          email.includes(query);

        if (!matchesSearch) {
          return false;
        }
      }

      // Department filter
      if (filters.department && user.department !== filters.department) {
        return false;
      }

      // Activity status filter
      if (filters.activityStatus && user.activityStatus !== filters.activityStatus) {
        return false;
      }

      return true;
    });
  }

  // Reset all filters
  function resetFilters() {
    filters = {
      department: '',
      activityStatus: ''
    };
    searchQuery = '';
    applyFilters();
  }

  // Watch for filter changes
  $effect(() => {
    searchQuery;
    if (users.length > 0) {
      applyFilters();
    }
  });

  // Add new teacher
  async function addTeacher() {
    try {
      await addDoc(collection(db, 'users'), teacherForm);
      teacherForm = {
        firstName: '',
        middleName: '',
        surname: '',
        email: '',
        username: '',
        password: '',
        role: 'teacher',
        activityStatus: 'Active',
        employeeNumber: '',
        department: '',
        interests: []
      };
      showForm = false;
      await loadUsers(); // Refresh data
    } catch (error) {
      console.error('Error adding teacher:', error);
    }
  }

  // Edit user
  function editUser(user) {
    editingUser = user;
    teacherForm = {
      firstName: user.firstName || '',
      middleName: user.middleName || '',
      surname: user.surname || '',
      email: user.email || '',
      username: user.username || '',
      password: '', // Don't pre-fill password when editing
      role: user.role || 'teacher',
      activityStatus: user.activityStatus || 'Active',
      employeeNumber: user.employeeNumber || '',
      department: user.department || '',
      interests: user.interests || []
    };
    console.log('Editing teacher:', user);
    console.log('Form data:', teacherForm);
    showForm = true;
  }

  // Update user
  async function updateUser() {
    try {
      const updateData = {
        firstName: teacherForm.firstName,
        middleName: teacherForm.middleName,
        surname: teacherForm.surname,
        email: teacherForm.email,
        username: teacherForm.username,
        role: teacherForm.role,
        activityStatus: teacherForm.activityStatus,
        employeeNumber: teacherForm.employeeNumber,
        department: teacherForm.department
      };

      console.log('Updating teacher with data:', updateData);
      
      await updateDoc(doc(db, 'users', editingUser.id), updateData);
      editingUser = null;
      teacherForm = {
        firstName: '',
        middleName: '',
        surname: '',
        email: '',
        username: '',
        password: '',
        role: 'teacher',
        activityStatus: 'Active',
        employeeNumber: '',
        department: '',
        interests: []
      };
      showForm = false;
      await loadUsers(); // Refresh data
    } catch (error) {
      console.error('Error updating teacher:', error);
    }
  }

  // Delete user
  async function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this teacher? Note: To allow the email to be reused, you must also delete the user from Firebase Authentication Console.')) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        await loadUsers(); // Refresh data
      } catch (error) {
        console.error('Error deleting teacher:', error);
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

  // Handle modal overlay click
  function handleOverlayClick(event) {
    if (event.target === event.currentTarget) {
      showForm = false;
    }
  }

  // Handle Escape key for modal
  function handleKeydown(event) {
    if (event.key === 'Escape' && showForm) {
      showForm = false;
    }
  }

  // Initialize on component mount
  loadUsers();
</script>

<div class="teachers-container">
  <!-- Header -->
  <header class="page-header">
    <div class="header-content">
      <div class="brand-line"><Logo /></div>
      <h1>Teachers Management</h1>
      <nav class="breadcrumb">
        <a href="/dashboard">Dashboard</a> / Teachers
      </nav>
    </div>
    <div class="header-actions">
      <button class="dashboard-btn" onclick={() => goto('/dashboard')}>
        Return to Dashboard
      </button>
      <button class="add-btn" onclick={() => goto('/dashboard/register')}>
        Register Teacher
      </button>
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  {#if loading}
    <div class="loading">Loading teachers...</div>
  {:else}
    <!-- Filters Section -->
    <section class="filters-section">
      <h3>Filters</h3>
      <div class="filters-container">
        <div class="search-group">
          <label for="searchInput">Search</label>
          <input 
            id="searchInput" 
            type="text" 
            placeholder="Search name, employee#, username, or email" 
            bind:value={searchQuery}
          />
        </div>
        
        <div class="filter-group">
          <label for="departmentFilter">Department</label>
          <select id="departmentFilter" bind:value={filters.department} onchange={applyFilters}>
            <option value="">All Departments</option>
            <option value="Filipino">Filipino</option>
            <option value="Social Science">Social Science</option>
            <option value="ICT">ICT</option>
            <option value="Animation">Animation</option>
            <option value="P.E.">P.E.</option>
            <option value="ABM">ABM</option>
            <option value="English">English</option>
            <option value="STEM">STEM</option>
            <option value="Science">Science</option>
            <option value="Math">Math</option>
            <option value="Business">Business</option>
          </select>
        </div>

        <div class="filter-group">
          <label for="activityStatusFilter">Activity Status</label>
          <select id="activityStatusFilter" bind:value={filters.activityStatus} onchange={applyFilters}>
            <option value="">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        <div class="filter-actions">
          <button class="reset-filters-btn" onclick={resetFilters}>Reset Filters</button>
          <span class="results-count">Showing {filteredUsers.length} of {users.length} teachers</span>
        </div>
      </div>
    </section>

    <!-- Teachers Table -->
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
            {#each sortedUsers as user, index}
              <tr>
                <td>{index + 1}</td>
                <td>{idNumberOf(user) || '-'}</td>
                <td>{fullName(user)}</td>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>{user.department || '-'}</td>
                <td>{user.activityStatus || 'Active'}</td>
                <td>
                  <button class="table-btn edit-btn" onclick={() => editUser(user)}>Edit</button>
                  <button class="table-btn delete-btn" onclick={() => deleteUser(user.id)}>Delete</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <!-- Add/Edit Teacher Modal -->
  {#if showForm}
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1" onclick={handleOverlayClick} onkeydown={handleKeydown}>
      <div class="modal-content" role="document">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 id="modal-title">{editingUser ? 'Edit Teacher' : 'Add New Teacher'}</h3>
          <button type="button" class="close-btn" onclick={() => showForm = false} aria-label="Close modal">&times;</button>
        </div>
        <form onsubmit={(e) => { e.preventDefault(); editingUser ? updateUser() : addTeacher();}}>
          <div class="form-section">
            <h4>Personal Information</h4>
            <div class="form-grid">
              <div>
                <label>First Name *</label>
                <input type="text" placeholder="First Name" bind:value={teacherForm.firstName} required>
              </div>
              <div>
                <label>Middle Name</label>
                <input type="text" placeholder="Middle Name" bind:value={teacherForm.middleName}>
              </div>
              <div>
                <label>Surname *</label>
                <input type="text" placeholder="Surname" bind:value={teacherForm.surname} required>
              </div>
              <div>
                <label>Email *</label>
                <input type="email" placeholder="Email" bind:value={teacherForm.email} required>
              </div>
              <div>
                <label>Username *</label>
                <input type="text" placeholder="Username" bind:value={teacherForm.username} required>
              </div>
              {#if !editingUser}
                <div>
                  <label>Password *</label>
                  <input type="password" placeholder="Password" bind:value={teacherForm.password} required>
                </div>
              {/if}
            </div>
          </div>

          <div class="form-section">
            <h4>Teacher Information</h4>
            <div class="form-grid">
              <div>
                <label>Employee Number *</label>
                <input type="text" placeholder="Employee Number" bind:value={teacherForm.employeeNumber} required>
              </div>
              <div>
                <label>Department *</label>
                <select bind:value={teacherForm.department} required>
                  <option value="">Select Department</option>
                  <option value="Filipino">Filipino</option>
                  <option value="Social Science">Social Science</option>
                  <option value="ICT">ICT</option>
                  <option value="Animation">Animation</option>
                  <option value="P.E.">P.E.</option>
                  <option value="ABM">ABM</option>
                  <option value="English">English</option>
                  <option value="STEM">STEM</option>
                  <option value="Science">Science</option>
                  <option value="Math">Math</option>
                  <option value="Business">Business</option>
                </select>
              </div>
              <div>
                <label>Activity Status *</label>
                <select bind:value={teacherForm.activityStatus} required>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="cancel-btn" onclick={() => showForm = false}>Cancel</button>
            <button type="submit" class="submit-btn">{editingUser ? 'Update Teacher' : 'Add Teacher'}</button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>

<style>
  @import '../style.css';

  .teachers-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--border);
  }

  .header-content {
    display: flex;
    flex-direction: column;
  }

  .brand-line {
    margin-bottom: 10px;
  }

  .breadcrumb {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-top: 5px;
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

  .dashboard-btn,
  .add-btn,
  .logout-btn {
    padding: 10px 20px;
    border-radius: var(--radius);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
  }

  .dashboard-btn {
    background: white;
    color: var(--brand);
    border: 2px solid var(--brand);
  }

  .dashboard-btn:hover {
    background: var(--brand);
    color: white;
  }

  .add-btn {
    background: var(--brand);
    color: white;
  }

  .add-btn:hover {
    background: var(--brand-dark);
  }

  .logout-btn {
    background: var(--critical);
    color: white;
  }

  .logout-btn:hover {
    background: var(--critical-dark);
  }

  .filters-section {
    background: white;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    margin-bottom: 20px;
  }

  .filters-section h3 {
    margin: 0 0 15px 0;
    color: var(--text-heading);
  }

  .filters-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    align-items: end;
  }

  .search-group,
  .filter-group {
    display: flex;
    flex-direction: column;
  }

  .search-group label,
  .filter-group label {
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 5px;
    color: var(--text-heading);
  }

  .search-group input,
  .filter-group select {
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
  }

  .filter-actions {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
  }

  .reset-filters-btn {
    background: var(--surface-alt);
    color: var(--text-heading);
    border: 1px solid var(--border);
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.875rem;
  }

  .reset-filters-btn:hover {
    background: var(--border);
  }

  .results-count {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .table-section {
    background: white;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
  }

  .table-container {
    overflow-x: auto;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
  }

  .data-table th,
  .data-table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }

  .data-table th {
    background: var(--surface-alt);
    font-weight: 600;
    color: var(--text-heading);
  }

  .sort-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: inherit;
    font-weight: inherit;
    color: inherit;
    padding: 0;
    text-align: left;
  }

  .sort-btn:hover {
    color: var(--brand);
  }

  .table-btn {
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    cursor: pointer;
    border: none;
    margin-right: 5px;
  }

  .edit-btn {
    background: var(--brand);
    color: white;
  }

  .edit-btn:hover {
    background: var(--brand-dark);
  }

  .delete-btn {
    background: var(--critical);
    color: white;
  }

  .delete-btn:hover {
    background: var(--critical-dark);
  }

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
    border-radius: var(--radius);
    padding: 30px;
    max-width: 600px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--text-muted);
  }

  .close-btn:hover {
    color: var(--text-heading);
  }

  .form-section {
    margin-bottom: 20px;
  }

  .form-section h4 {
    margin: 0 0 15px 0;
    color: var(--text-heading);
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
  }

  .form-grid label {
    display: block;
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 5px;
    color: var(--text-heading);
  }

  .form-grid input,
  .form-grid select {
    width: 100%;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
  }

  .cancel-btn,
  .submit-btn {
    padding: 10px 20px;
    border-radius: var(--radius);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
  }

  .cancel-btn {
    background: var(--surface-alt);
    color: var(--text-heading);
  }

  .cancel-btn:hover {
    background: var(--border);
  }

  .submit-btn {
    background: var(--brand);
    color: white;
  }

  .submit-btn:hover {
    background: var(--brand-dark);
  }

  .loading {
    text-align: center;
    padding: 40px;
    color: var(--text-muted);
    font-size: 1.125rem;
  }
</style>