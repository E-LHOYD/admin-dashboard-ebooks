<script>
  import Logo from '$lib/components/Logo.svelte';
  import { auth, db } from '$lib/firebase';
  import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
  import { signOut, deleteUser as deleteAuthUser } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { sortRows, sortIndicator, ariaSort } from '$lib/sortTable';
  import {
    hasRole,
    normalizeStudentType,
    studentTypeLabel,
    isCollege,
    isSeniorHigh,
    idNumberOf,
    fullName
  } from '$lib/users';

  // Reactive state variables
  let users = $state([]);
  let filteredUsers = $state([]);
  let loading = $state(true);
  let showForm = $state(false);
  let editingUser = $state(null);

  // Sorting. Several columns show a value that depends on who the row is --
  // a year for a college student, a grade for senior high, a department for a
  // teacher -- so each column sorts by exactly what its cell renders.
  let sortKey = $state('');
  let sortDir = $state('asc');

  const SORT_COLUMNS = [
    { key: 'idNumber', label: 'LRN/Student #', value: (u) => idNumberOf(u) },
    { key: 'name', label: 'Name', value: (u) => fullName(u) },
    { key: 'username', label: 'Username', value: (u) => u.username },
    { key: 'email', label: 'Email', value: (u) => u.email },
    { key: 'type', label: 'Type', value: (u) => studentTypeLabel(u) },
    {
      key: 'gradeYear',
      label: 'Grade/Year',
      value: (u) => (isCollege(u) ? u.year : isSeniorHigh(u) ? u.grade : '')
    },
    {
      key: 'courseStrand',
      label: 'Course/Strand',
      value: (u) => isCollege(u) ? u.course : isSeniorHigh(u) ? u.strand : ''
    },
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
    type: '',
    course: '',
    strand: '',
    grade: '',
    year: '',
    activityStatus: ''
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
    role: 'student',
    activityStatus: 'Active',
    type: 'college',
    course: '',
    year: '',
    studentNumber: '',
    strand: '',
    grade: '',
    lrn: '',
    interests: []
  });

  // Load users data
  async function loadUsers() {
    try {
      const usersQuery = query(collection(db, 'users'), orderBy('surname'));
      const usersSnapshot = await getDocs(usersQuery);
      const allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Filter only students
      users = allUsers.filter(u => hasRole(u, 'student'));
      applyFilters();
      loading = false;
    } catch (error) {
      console.error('Error loading students:', error);
      loading = false;
    }
  }

  // Apply filters to users
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
      
      // Grade filter (for SHS students)
      if (filters.grade && user.grade !== filters.grade) {
        return false;
      }
      
      // Year filter (for college students)
      if (filters.year && user.year !== filters.year) {
        return false;
      }

      // Activity status filter (for students and teachers)
      if (filters.activityStatus && user.activityStatus !== filters.activityStatus) {
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
      grade: '',
      year: '',
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
        role: 'student',
        activityStatus: 'Active',
        type: 'college',
        course: '',
        year: '',
        studentNumber: '',
        strand: '',
        grade: '',
        lrn: '',
        interests: []
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
    studentForm = {
      firstName: user.firstName || '',
      middleName: user.middleName || '',
      surname: user.surname || '',
      email: user.email || '',
      username: user.username || '',
      password: '', // Don't pre-fill password when editing
      role: user.role || 'student',
      activityStatus: user.activityStatus || 'Active',
      type: user.type || user.studentType === 'senior-high' ? 'shs' : 'college',
      course: user.course || '',
      year: user.year || '',
      studentNumber: user.studentNumber || '',
      strand: user.strand || '',
      grade: user.grade || '',
      lrn: user.lrn || '',
      interests: user.interests || []
    };
    console.log('Editing student:', user);
    console.log('Form data:', studentForm);
    showForm = true;
  }

  // Update user
  async function updateUser() {
    try {
      const updateData = {
        firstName: studentForm.firstName,
        middleName: studentForm.middleName,
        surname: studentForm.surname,
        email: studentForm.email,
        username: studentForm.username,
        role: studentForm.role,
        activityStatus: studentForm.activityStatus,
        type: studentForm.type,
        studentType: studentForm.type === 'shs' ? 'senior-high' : 'college'
      };

      // Add student-specific fields
      if (studentForm.type === 'college') {
        updateData.course = studentForm.course;
        updateData.year = studentForm.year;
        updateData.studentNumber = studentForm.studentNumber;
      } else {
        updateData.strand = studentForm.strand;
        updateData.grade = studentForm.grade;
        updateData.lrn = studentForm.lrn;
      }

      console.log('Updating student with data:', updateData);
      
      await updateDoc(doc(db, 'users', editingUser.id), updateData);
      editingUser = null;
      studentForm = {
        firstName: '',
        middleName: '',
        surname: '',
        email: '',
        username: '',
        password: '',
        role: 'student',
        activityStatus: 'Active',
        type: 'college',
        course: '',
        year: '',
        studentNumber: '',
        strand: '',
        grade: '',
        lrn: '',
        interests: []
      };
      showForm = false;
      await loadUsers(); // Refresh data
    } catch (error) {
      console.error('Error updating student:', error);
    }
  }

  // Delete user
  async function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this student? Note: To allow the email to be reused, you must also delete the user from Firebase Authentication Console.')) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        await loadUsers(); // Refresh data
      } catch (error) {
        console.error('Error deleting student:', error);
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
      <div class="brand-line"><Logo /></div>
      <h1>Students Management</h1>
      <nav class="breadcrumb">
        <a href="/dashboard">Dashboard</a> / Students
      </nav>
    </div>
    <div class="header-actions">
      <button class="dashboard-btn" onclick={() => goto('/dashboard')}>
        Return to Dashboard
      </button>
      <button class="register-btn" onclick={() => goto('/dashboard/register')}>
        Register Student
      </button>
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  {#if loading}
    <div class="loading">Loading students...</div>
  {:else}
    <!-- Statistics Cards -->
    <section class="stats-section">
      <h2>Overview</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-number">{users.length}</div>
          <div class="stat-label">Total Students</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">{filteredUsers.length}</div>
          <div class="stat-label">Filtered Students</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">{users.filter(u => normalizeStudentType(u) === 'college').length}</div>
          <div class="stat-label">College Students</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">{users.filter(u => normalizeStudentType(u) === 'senior-high').length}</div>
          <div class="stat-label">Senior High Students</div>
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
            placeholder="Search name, LRN/student#, username, or email" 
            bind:value={searchQuery}
          />
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

        <div class="filter-group">
          <label for="activityStatusFilter">Activity Status</label>
          <select id="activityStatusFilter" bind:value={filters.activityStatus} onchange={applyFilters}>
            <option value="">All Status</option>
            <option value="Active">Active</option>
            <option value="Graduated">Graduated</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        <div class="filter-actions">
          <button class="reset-filters-btn" onclick={resetFilters}>Reset Filters</button>
          <span class="results-count">Showing {filteredUsers.length} of {users.length} students</span>
        </div>
      </div>
    </section>

    <!-- Students Table -->
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
                  {user.activityStatus || 'Active'}
                </td>
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
          <h3 id="modal-title">{editingUser ? 'Edit Student' : 'Add New Student'}</h3>
          <button type="button" class="close-btn" onclick={() => showForm = false} aria-label="Close modal">&times;</button>
        </div>
        <form onsubmit={(e) => { e.preventDefault(); editingUser ? updateUser() : addStudent(); }}>
          <div class="form-section">
            <h4>Personal Information</h4>
            <div class="form-grid">
              <div>
                <label for="firstName">First Name *</label>
                <input id="firstName" type="text" placeholder="First Name" bind:value={studentForm.firstName} required>
              </div>
              <div>
                <label for="middleName">Middle Name</label>
                <input id="middleName" type="text" placeholder="Middle Name" bind:value={studentForm.middleName}>
              </div>
              <div>
                <label for="surname">Surname *</label>
                <input id="surname" type="text" placeholder="Surname" bind:value={studentForm.surname} required>
              </div>
              <div>
                <label for="email">Email *</label>
                <input id="email" type="email" placeholder="Email" bind:value={studentForm.email} required>
              </div>
              <div>
                <label for="username">Username *</label>
                <input id="username" type="text" placeholder="Username" bind:value={studentForm.username} required>
              </div>
              {#if !editingUser}
                <div>
                  <label for="password">Password *</label>
                  <input id="password" type="password" placeholder="Password" bind:value={studentForm.password} required>
                </div>
              {/if}
            </div>
          </div>

          <div class="form-section">
            <h4>Student Information</h4>
            <div class="form-grid">
              <div>
                <label for="activityStatus">Activity Status *</label>
                <select id="activityStatus" bind:value={studentForm.activityStatus} required>
                  <option value="Active">Active</option>
                  <option value="Graduated">Graduated</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          <div class="form-section">
            <h4>Student Type</h4>
            <div class="form-grid">
              <div>
                <label for="type">Type *</label>
                <select id="type" bind:value={studentForm.type} required>
                  <option value="college">College</option>
                  <option value="shs">Senior High</option>
                </select>
              </div>
            </div>
          </div>

          {#if studentForm.type === 'college'}
              <div class="form-section">
                <h4>College Information</h4>
                <div class="form-grid">
                  <div>
                    <label for="studentNumber">Student Number</label>
                    <input id="studentNumber" type="text" placeholder="Student Number" bind:value={studentForm.studentNumber}>
                  </div>
                  <div>
                    <label for="course">Course</label>
                    <select id="course" bind:value={studentForm.course}>
                      <option value="">Select Course</option>
                      <option value="BSCS">BSCS</option>
                      <option value="BSIT">BSIT</option>
                      <option value="BSBA">BSBA</option>
                      <option value="BSIS">BSIS</option>
                    </select>
                  </div>
                  <div>
                    <label for="year">Year</label>
                    <select id="year" bind:value={studentForm.year}>
                      <option value="">Select Year</option>
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                      <option value="5th Year">5th Year</option>
                    </select>
                  </div>
                </div>
              </div>
            {:else}
              <div class="form-section">
                <h4>Senior High Information</h4>
                <div class="form-grid">
                  <div>
                    <label for="lrn">Learner's Reference Number (LRN)</label>
                    <input id="lrn" type="text" placeholder="LRN" bind:value={studentForm.lrn}>
                  </div>
                  <div>
                    <label for="strand">Strand</label>
                    <select id="strand" bind:value={studentForm.strand}>
                      <option value="">Select Strand</option>
                      <option value="STEM">STEM</option>
                      <option value="ABM">ABM</option>
                      <option value="HUMSS">HUMSS</option>
                      <option value="GAS">GAS</option>
                      <option value="TVL">TVL</option>
                      <option value="ICT - ANIMATION">ICT - ANIMATION</option>
                      <option value="ICT">ICT</option>
                    </select>
                  </div>
                  <div>
                    <label for="grade">Grade</label>
                    <select id="grade" bind:value={studentForm.grade}>
                      <option value="">Select Grade</option>
                      <option value="Grade 11">Grade 11</option>
                      <option value="Grade 12">Grade 12</option>
                    </select>
                  </div>
                </div>
              </div>
            {/if}

          <div class="modal-actions">
            <button type="button" class="cancel-btn" onclick={() => showForm = false}>Cancel</button>
            <button type="submit" class="submit-btn">{editingUser ? 'Update Student' : 'Add Student'}</button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>

<style>
  @import '../style.css';

  /* Student-specific column widths */
  .data-table th:nth-child(1) {
    width: 30px;
  }

  .data-table th:nth-child(2) {
    width: 100px;
  }

  .data-table th:nth-child(3) {
    width: 150px;
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
    width: 70px;
  }

  .data-table th:nth-child(8) {
    width: 80px;
  }

  .data-table th:nth-child(9) {
    width: 80px;
  }

  .data-table th:nth-child(10) {
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

  .data-table th:nth-child(1) {
    width: 50px;
    text-align: center;
  }

  .data-table td:nth-child(1) {
    text-align: center;
    font-weight: bold;
  }

  .data-table th:nth-child(2) {
    min-width: 150px;
  }

  .data-table th:nth-child(8),
  .data-table th:nth-child(9) {
    min-width: 120px;
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
