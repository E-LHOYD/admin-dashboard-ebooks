<script>
  import { auth, db } from '$lib/firebase';
  import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';

  // Reactive state variables
  let users = $state([]);
  let filteredUsers = $state([]);
  let loading = $state(true);
  let showForm = $state(false);
  let editingUser = $state(null);

  // Filter state
  let filters = $state({
    type: '',
    course: '',
    strand: '',
    role: '',
    grade: '',
    year: ''
  });

  // Search state
  let searchQuery = $state('');

  // Student form data
  let studentForm = $state({
    firstName: '',
    middleName: '',
    surname: '',
    email: '',
    username: '',
    password: '',
    role: 'Student'
  });

  // Load users data
  async function loadUsers() {
    try {
      const usersQuery = query(collection(db, 'users'), orderBy('surname'));
      const usersSnapshot = await getDocs(usersQuery);
      users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      applyFilters();
      loading = false;
    } catch (error) {
      console.error('Error loading users:', error);
      loading = false;
    }
  }

  // Apply filters to users
  function applyFilters() {
    filteredUsers = users.filter(user => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const fullName = `${user.firstName} ${user.middleName} ${user.surname}`.toLowerCase();
        const username = user.username?.toLowerCase() || '';
        const email = user.email?.toLowerCase() || '';
        const lrnOrStudentNumber = user.type === 'college' 
          ? (user.studentNumber?.toLowerCase() || '')
          : (user.lrn?.toLowerCase() || '');
        const documentId = user.id?.toLowerCase() || '';

        const matchesSearch = 
          fullName.includes(query) ||
          username.includes(query) ||
          email.includes(query) ||
          lrnOrStudentNumber.includes(query) ||
          documentId.includes(query);

        if (!matchesSearch) {
          return false;
        }
      }

      // Type filter
      if (filters.type && user.type !== filters.type) {
        return false;
      }
      
      // Course filter (for college students)
      if (filters.course && user.course !== filters.course) {
        return false;
      }
      
      // Strand filter (for SHS students)
      if (filters.strand && user.strand !== filters.strand) {
        return false;
      }
      
      // Role filter
      if (filters.role && user.role !== filters.role) {
        return false;
      }
      
      // Grade filter (for SHS students)
      if (filters.grade && user.grade !== filters.grade) {
        return false;
      }
      
      // Year filter (for college students)
      if (filters.year && user.year !== filters.year) {
        return false;
      }
      
      return true;
    });
  }

  // Reset all filters
  function resetFilters() {
    filters = {
      type: '',
      course: '',
      strand: '',
      role: '',
      grade: '',
      year: ''
    };
    searchQuery = '';
    applyFilters();
  }

  // Watch for filter and search changes
  $effect(() => {
    if (users.length > 0) {
      applyFilters();
    }
  });

  // Add new student
  async function addStudent() {
    try {
      await addDoc(collection(db, 'users'), studentForm);
      studentForm = {
        firstName: '',
        middleName: '',
        surname: '',
        email: '',
        username: '',
        password: '',
        role: 'Student'
      };
      showForm = false;
      await loadUsers(); // Refresh data
    } catch (error) {
      console.error('Error adding student:', error);
    }
  }

  // Edit user
  function editUser(user) {
    editingUser = user;
    studentForm = { ...user };
    showForm = true;
  }

  // Update user
  async function updateUser() {
    try {
      await updateDoc(doc(db, 'users', editingUser.id), studentForm);
      editingUser = null;
      studentForm = {
        firstName: '',
        middleName: '',
        surname: '',
        email: '',
        username: '',
        password: '',
        role: 'Student'
      };
      showForm = false;
      await loadUsers(); // Refresh data
    } catch (error) {
      console.error('Error updating user:', error);
    }
  }

  // Delete user
  async function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user?')) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        await loadUsers(); // Refresh data
      } catch (error) {
        console.error('Error deleting user:', error);
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

<div class="dashboard-container">
  <!-- Header -->
  <header class="dashboard-header">
    <div class="header-left">
      <h1>Gardner E-Books Library Dashboard</h1>
      <p class="user-info">Users Management</p>
    </div>
    <div class="header-actions">
      <button class="register-btn" onclick={() => goto('/dashboard')}>Return to Dashboard</button>
      <button class="register-btn" onclick={() => goto('/dashboard/register')}>Register User</button>
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  {#if loading}
    <div class="loading">Loading users...</div>
  {:else}
    <!-- Statistics Cards -->
    <section class="stats-section">
      <h2>Overview</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-number">{users.length}</div>
          <div class="stat-label">Total Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">{filteredUsers.length}</div>
          <div class="stat-label">Filtered Users</div>
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
            placeholder="Search name, username, email, LRN/Student#, Document ID" 
            bind:value={searchQuery}
          />
        </div>
        
        <div class="filter-group">
          <label for="roleFilter">Role</label>
          <select id="roleFilter" bind:value={filters.role}>
            <option value="">All Roles</option>
            <option value="Student">Student</option>
            <option value="Teacher">Teacher</option>
            <option value="Admin">Admin</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label for="typeFilter">Type</label>
          <select id="typeFilter" bind:value={filters.type}>
            <option value="">All Types</option>
            <option value="college">College</option>
            <option value="shs">Senior High School</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label for="courseFilter">Course</label>
          <select id="courseFilter" bind:value={filters.course}>
            <option value="">All Courses</option>
            <option value="BSCS">BSCS</option>
            <option value="BSBA">BSBA</option>
            <option value="BSIT">BSIT</option>
            <option value="BSIS">BSIS</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label for="strandFilter">Strand</label>
          <select id="strandFilter" bind:value={filters.strand}>
            <option value="">All Strands</option>
            <option value="STEM">STEM</option>
            <option value="ABM">ABM</option>
            <option value="HUMSS">HUMSS</option>
            <option value="GAS">GAS</option>
            <option value="TVL">TVL</option>
            <option value="SPORTS">SPORTS</option>
            <option value="ARTS & DESIGN">ARTS & DESIGN</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label for="yearFilter">Year</label>
          <select id="yearFilter" bind:value={filters.year}>
            <option value="">All Years</option>
            <option value="1st Year">1st Year</option>
            <option value="2nd Year">2nd Year</option>
            <option value="3rd Year">3rd Year</option>
            <option value="4th Year">4th Year</option>
            <option value="5th Year">5th Year</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label for="gradeFilter">Grade</label>
          <select id="gradeFilter" bind:value={filters.grade}>
            <option value="">All Grades</option>
            <option value="Grade 11">Grade 11</option>
            <option value="Grade 12">Grade 12</option>
          </select>
        </div>
        
        <div class="filter-actions">
          <button class="register-btn" onclick={resetFilters}>Reset Filters</button>
        </div>
      </div>
    </section>

    <!-- Users Table -->
    <section class="stats-section">
      <h2>Users List</h2>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Type</th>
              <th>Grade/Year</th>
              <th>Course/Strand</th>
              <th>LRN/Student #</th>
              <th>Document ID</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredUsers as user}
              <tr>
                <td>{user.firstName} {user.middleName} {user.surname}</td>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{user.type || '-'}</td>
                <td>
                  {#if user.type === 'college'}
                    {user.year || '-'}
                  {:else if user.type === 'shs'}
                    {user.grade || '-'}
                  {:else}
                    -
                  {/if}
                </td>
                <td>
                  {#if user.type === 'college'}
                    {user.course || '-'}
                  {:else if user.type === 'shs'}
                    {user.strand || '-'}
                  {:else}
                    -
                  {/if}
                </td>
                <td>
                  {#if user.type === 'college'}
                    {user.studentNumber || '-'}
                  {:else if user.type === 'shs'}
                    {user.lrn || '-'}
                  {:else}
                    -
                  {/if}
                </td>
                <td><code>{user.id}</code></td>
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

  <!-- Add/Edit Student Modal -->
  {#if showForm}
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1" onclick={handleOverlayClick} onkeydown={handleKeydown}>
      <div class="modal-content" role="document">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 id="modal-title">{editingUser ? 'Edit User' : 'Add New User'}</h3>
          <button type="button" class="close-btn" onclick={() => showForm = false} aria-label="Close modal">&times;</button>
        </div>
        <form onsubmit={(e) => { e.preventDefault(); editingUser ? updateUser() : addStudent(); }}>
          <div class="form-grid">
            <input type="text" placeholder="First Name" bind:value={studentForm.firstName} required>
            <input type="text" placeholder="Middle Name" bind:value={studentForm.middleName}>
            <input type="text" placeholder="Surname" bind:value={studentForm.surname} required>
            <input type="email" placeholder="Email" bind:value={studentForm.email} required>
            <input type="text" placeholder="Username" bind:value={studentForm.username} required>
            <input type="password" placeholder="Password" bind:value={studentForm.password} required>
          </div>
          <div class="modal-actions">
            <button type="button" class="cancel-btn" onclick={() => showForm = false}>Cancel</button>
            <button type="submit" class="submit-btn">{editingUser ? 'Update User' : 'Add User'}</button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>

<style>
  @import '../style.css';
  
  .dashboard-container {
    background-color: white;
    min-height: 100vh;
    padding: 20px;
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #ccc;
  }

  .header-left {
    display: flex;
    flex-direction: column;
  }

  .dashboard-header h1 {
    color: #033047;
    margin: 0;
    font-size: 1.25rem;
    font-weight: bold;
  }

  .user-info {
    color: #666;
    margin: 5px 0 0 0;
    font-size: 0.875rem;
  }

  .header-actions {
    display: flex;
    gap: 10px;
  }

  .register-btn {
    background: #033047;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: bold;
    width: auto;
  }

  .register-btn:hover {
    background: #024060;
  }

  .logout-btn {
    background: white;
    color: #033047;
    border: 2px solid #033047;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: bold;
    width: auto;
  }

  .logout-btn:hover {
    background: #033047;
    color: white;
  }

  .loading {
    text-align: center;
    font-size: 1rem;
    color: #033047;
    padding: 40px;
  }

  .stats-section {
    margin-bottom: 40px;
  }

  .stats-section h2 {
    color: #033047;
    font-size: 1rem;
    font-weight: bold;
    margin-bottom: 20px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
  }

  .stat-card {
    background: white;
    border: 1px solid #ccc;
    border-radius: 8;
    padding: 30px;
    text-align: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .stat-number {
    font-size: 1.5rem;
    font-weight: bold;
    color: #033047;
    margin-bottom: 10px;
  }

  .stat-label {
    font-size: 0.875rem;
    color: #666;
  }

  .filters-container {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    align-items: flex-end;
    padding: 20px;
    background: white;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    min-width: 150px;
  }

  .search-group {
    display: flex;
    flex-direction: column;
    min-width: 300px;
    flex-grow: 1;
  }

  .search-group input {
    padding: 8px 12px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 0.875rem;
    background: white;
    transition: border-color 0.2s ease;
  }

  .search-group input:focus {
    outline: none;
    border-color: #033047;
    box-shadow: 0 0 0 2px rgba(3, 48, 71, 0.25);
  }

  .filter-group label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #555;
    margin-bottom: 5px;
  }

  .filter-group select {
    padding: 8px 12px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 0.875rem;
    background: white;
    cursor: pointer;
    transition: border-color 0.2s ease;
  }

  .filter-group select:focus {
    outline: none;
    border-color: #033047;
    box-shadow: 0 0 0 2px rgba(3, 48, 71, 0.25);
  }

  .filter-actions {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-left: auto;
  }

  .table-container {
    overflow-x: auto;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border: 1px solid #ccc;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .data-table th,
  .data-table td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid #ccc;
  }

  .data-table th {
    background: #f8f9fa;
    font-weight: 600;
    color: #033047;
    border-bottom: 2px solid #ccc;
  }

  .data-table tr:hover {
    background: #f8f9fa;
  }

  .data-table code {
    background: #f8f9fa;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.75rem;
    color: #033047;
    font-family: 'Courier New', monospace;
  }

  .data-table th:nth-child(5),
  .data-table th:nth-child(6),
  .data-table th:nth-child(7),
  .data-table th:nth-child(8),
  .data-table th:nth-child(9) {
    min-width: 120px;
  }

  .data-table td:nth-child(9) code {
    font-size: 0.625rem;
  }

  .table-btn {
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    margin-right: 5px;
    transition: background-color 0.2s ease;
  }

  .edit-btn {
    background: #033047;
    color: white;
  }

  .edit-btn:hover {
    background: #024060;
  }

  .delete-btn {
    background: #dc3545;
    color: white;
  }

  .delete-btn:hover {
    background: #c82333;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
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
    outline: 2px solid #033047;
    outline-offset: 2px;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 16px;
    overflow-y: auto;
    z-index: 100;
  }

  .modal-content {
    position: relative;
    background: #fff;
    border-radius: 8px;
    padding: 24px;
    width: 100%;
    max-width: 560px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  }

  .modal-content h3 {
    margin-top: 0;
    color: #033047;
    font-size: 1.125rem;
    font-weight: bold;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 15px;
    margin-bottom: 20px;
  }

  .form-grid input {
    width: 100%;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
    font-size: 0.875rem;
    font-family: inherit;
    box-sizing: border-box;
  }

  .form-grid input:focus {
    outline: none;
    border-color: #033047;
    box-shadow: 0 0 0 2px rgba(3, 48, 71, 0.25);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .cancel-btn {
    background: white;
    color: #033047;
    border: 2px solid #033047;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: bold;
  }

  .cancel-btn:hover {
    background: #033047;
    color: white;
  }

  .submit-btn {
    background: #033047;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: bold;
  }

  .submit-btn:hover {
    background: #024060;
  }
</style>
