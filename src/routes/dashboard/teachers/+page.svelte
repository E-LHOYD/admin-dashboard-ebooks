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
      <button class="register-btn" onclick={() => goto('/dashboard/register')}>
        Register Teacher
      </button>
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  {#if loading}
    <div class="loading">Loading teachers...</div>
  {:else}
    <!-- Statistics Cards -->
    <section class="stats-section">
      <h2>Overview</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-number">{users.length}</div>
          <div class="stat-label">Total Teachers</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">{filteredUsers.length}</div>
          <div class="stat-label">Filtered Teachers</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">{users.filter(u => u.activityStatus === 'Active').length}</div>
          <div class="stat-label">Active Teachers</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">{users.filter(u => u.activityStatus === 'Inactive').length}</div>
          <div class="stat-label">Inactive Teachers</div>
        </div>
      </div>
    </section>

    <!-- Filters Section -->
    <section class="stats-section">
      <h2>Filters</h2>
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
                <label for="firstName">First Name *</label>
                <input id="firstName" type="text" placeholder="First Name" bind:value={teacherForm.firstName} required>
              </div>
              <div>
                <label for="middleName">Middle Name</label>
                <input id="middleName" type="text" placeholder="Middle Name" bind:value={teacherForm.middleName}>
              </div>
              <div>
                <label for="surname">Surname *</label>
                <input id="surname" type="text" placeholder="Surname" bind:value={teacherForm.surname} required>
              </div>
              <div>
                <label for="email">Email *</label>
                <input id="email" type="email" placeholder="Email" bind:value={teacherForm.email} required>
              </div>
              <div>
                <label for="username">Username *</label>
                <input id="username" type="text" placeholder="Username" bind:value={teacherForm.username} required>
              </div>
              {#if !editingUser}
                <div>
                  <label for="password">Password *</label>
                  <input id="password" type="password" placeholder="Password" bind:value={teacherForm.password} required>
                </div>
              {/if}
            </div>
          </div>

          <div class="form-section">
            <h4>Teacher Information</h4>
            <div class="form-grid">
              <div>
                <label for="employeeNumber">Employee Number *</label>
                <input id="employeeNumber" type="text" placeholder="Employee Number" bind:value={teacherForm.employeeNumber} required>
              </div>
              <div>
                <label for="department">Department *</label>
                <select id="department" bind:value={teacherForm.department} required>
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
                <label for="activityStatus">Activity Status *</label>
                <select id="activityStatus" bind:value={teacherForm.activityStatus} required>
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

  /* Teachers-specific column widths */
  .data-table th:nth-child(1) {
    width: 30px;
  }

  .data-table th:nth-child(2) {
    width: 120px;
  }

  .data-table th:nth-child(3) {
    width: 140px;
  }

  .data-table th:nth-child(4) {
    width: 120px;
  }

  .data-table th:nth-child(5) {
    width: 140px;
  }

  .data-table th:nth-child(6) {
    width: 70px;
  }

  .data-table th:nth-child(7) {
    width: 80px;
  }

  .data-table th:nth-child(8) {
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