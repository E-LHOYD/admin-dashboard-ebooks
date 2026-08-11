<script>
  import { auth, db } from '$lib/firebase';
  import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import {
    hasRole,
    roleLabel,
    normalizeStudentType,
    studentTypeLabel,
    isCollege,
    isSeniorHigh,
    fullName
  } from '$lib/users';

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

  // Student form data
  let studentForm = $state({
    firstName: '',
    middleName: '',
    surname: '',
    email: '',
    username: '',
    password: '',
    role: 'student'
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
      // Type filter
      // Read through the normaliser: the app writes studentType 'senior-high'
      // where the dashboard wrote type 'shs', and this page used to see only
      // the second, so nobody who signed up in the app appeared here at all.
      if (filters.type && normalizeStudentType(user) !== filters.type) {
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
      // Same for role: the app writes 'student', the dashboard wrote 'Student'.
      if (filters.role && !hasRole(user, filters.role)) {
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
    applyFilters();
  }

  // Watch for filter changes
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
        role: 'student'
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
        role: 'student'
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

<div class="students-container">
  <!-- Header -->
  <header class="page-header">
    <div class="header-content">
      <h1>Users Management</h1>
      <nav class="breadcrumb">
        <a href="/dashboard">Dashboard</a> / Users
      </nav>
    </div>
    <div class="header-actions">
      <button class="dashboard-btn" onclick={() => goto('/dashboard')}>
        Return to Dashboard
      </button>
      <button class="add-btn" onclick={() => goto('/dashboard/register')}>
        + Register User
      </button>
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  {#if loading}
    <div class="loading">Loading users...</div>
  {:else}
    <!-- Filters Section -->
    <section class="filters-section">
      <h3>Filters</h3>
      <div class="filters-container">
        <div class="filter-group">
          <label for="roleFilter">Role</label>
          <select id="roleFilter" bind:value={filters.role} onchange={applyFilters}>
            <option value="">All Roles</option>
            <option value="Student">Student</option>
            <option value="Teacher">Teacher</option>
            <option value="Admin">Admin</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label for="typeFilter">Type</label>
          <select id="typeFilter" bind:value={filters.type} onchange={applyFilters}>
            <option value="">All Types</option>
            <option value="college">College</option>
            <option value="senior-high">Senior High School</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label for="courseFilter">Course</label>
          <select id="courseFilter" bind:value={filters.course} onchange={applyFilters}>
            <option value="">All Courses</option>
            <option value="BSCS">BSCS</option>
            <option value="BSBA">BSBA</option>
            <option value="BSIT">BSIT</option>
            <option value="BSIS">BSIS</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label for="strandFilter">Strand</label>
          <select id="strandFilter" bind:value={filters.strand} onchange={applyFilters}>
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
          <select id="yearFilter" bind:value={filters.year} onchange={applyFilters}>
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
          <select id="gradeFilter" bind:value={filters.grade} onchange={applyFilters}>
            <option value="">All Grades</option>
            <option value="Grade 11">Grade 11</option>
            <option value="Grade 12">Grade 12</option>
          </select>
        </div>
        
        <div class="filter-actions">
          <button class="reset-filters-btn" onclick={resetFilters}>Reset Filters</button>
          <span class="results-count">Showing {filteredUsers.length} of {users.length} users</span>
        </div>
      </div>
    </section>

    <!-- Users Table -->
    <section class="table-section">
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
                <td>{fullName(user)}</td>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>{roleLabel(user) || '-'}</td>
                <td>{studentTypeLabel(user) || '-'}</td>
                <td>
                  {#if isCollege(user)}
                    {user.year || '-'}
                  {:else if isSeniorHigh(user)}
                    {user.grade || '-'}
                  {:else}
                    -
                  {/if}
                </td>
                <td>
                  {#if isCollege(user)}
                    {user.course || '-'}
                  {:else if isSeniorHigh(user)}
                    {user.strand || '-'}
                  {:else}
                    -
                  {/if}
                </td>
                <td>
                  {#if isCollege(user)}
                    {user.studentNumber || '-'}
                  {:else if isSeniorHigh(user)}
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
            <button type="submit" class="submit-btn">{editingStudent ? 'Update Student' : 'Add Student'}</button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>

<style>
  @import '../style.css';

  .students-container {
    max-width: 1600px;
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

  .dashboard-btn {
    background: #007bff;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 16px;
    transition: background-color 0.3s ease;
  }

  .dashboard-btn:hover {
    background: #0056b3;
  }

  .add-btn {
    background: #28a745;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 16px;
  }

  .add-btn:hover {
    background: #218838;
  }

  .filters-section {
    margin-bottom: 30px;
    padding: 20px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .filters-section h3 {
    margin: 0 0 20px 0;
    color: #333;
    font-size: 18px;
    border-bottom: 1px solid #eee;
    padding-bottom: 10px;
  }

  .filters-container {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    align-items: flex-end;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    min-width: 150px;
  }

  .filter-group label {
    font-size: 12px;
    font-weight: 600;
    color: #555;
    margin-bottom: 5px;
  }

  .filter-group select {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    background: white;
    cursor: pointer;
    transition: border-color 0.2s ease;
  }

  .filter-group select:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
  }

  .filter-actions {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-left: auto;
  }

  .reset-filters-btn {
    background: #6c757d;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s ease;
  }

  .reset-filters-btn:hover {
    background: #5a6268;
  }

  .results-count {
    color: #666;
    font-size: 14px;
    font-weight: 500;
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

  .data-table code {
    background: #f8f9fa;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
    color: #e83e8c;
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
    font-size: 10px;
  }

  .table-section {
    margin-bottom: 40px;
  }

  .table-container {
    overflow-x: visible;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .data-table th,
  .data-table td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid #eee;
  }

  .data-table th {
    background: #f8f9fa;
    font-weight: 600;
    color: #333;
    border-bottom: 2px solid #dee2e6;
  }

  .data-table tr:hover {
    background: #f8f9fa;
  }

  .table-btn {
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    margin-right: 5px;
    transition: background-color 0.2s ease;
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
