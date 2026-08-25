<script>
  import { auth, db } from '$lib/firebase';
  import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
  import { collection, doc, setDoc } from 'firebase/firestore';
  import { goto } from '$app/navigation';
  import { DEFAULT_SUBJECTS } from '$lib/subjects';
  import { DEPARTMENTS } from '$lib/users';

  // Form state
  let formData = $state({
    firstName: '',
    middleName: '',
    surname: '',
    type: '', //college or shs
    year: '', //if college
    grade: '', //if shs
    course: '', //if college
    strand: '', //if shs
    studentNumber: '', //if college
    lrn: '', //if shs
    employeeNumber: '', //if teacher
    department: '', //if teacher
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    role: 'student',
    interests: [],
    activityStatus: 'Active' // Active, Graduated, Inactive (for students and teachers)
  });

  // The app makes every account choose exactly three, so this does too.
  const REQUIRED_INTERESTS = 3;

  let loading = $state(false);
  let error = $state('');
  let success = $state('');
  let showPassword = $state(false);
  let showConfirmPassword = $state(false);

  // Handle form submission
  async function handleRegister(event) {
    event.preventDefault();
    
    // Reset states
    error = '';
    success = '';
    loading = true;

    // Validation
    if (!formData.firstName || !formData.surname || !formData.email || !formData.username || !formData.password) {
      error = 'Please fill in all required fields';
      loading = false;
      return;
    }

    // Additional validation for student type
    if (formData.role === 'student' && !formData.type) {
      error = 'Please select student type (College or SHS)';
      loading = false;
      return;
    }

    if (formData.role === 'student' && !formData.activityStatus) {
      error = 'Please select activity status (Active, Graduated, or Inactive)';
      loading = false;
      return;
    }

    if (formData.role === 'teacher' && (!formData.employeeNumber || !formData.department)) {
      error = 'Please fill in all teacher fields';
      loading = false;
      return;
    }

    if (formData.role === 'teacher' && !formData.activityStatus) {
      error = 'Please select activity status (Active, Graduated, or Inactive)';
      loading = false;
      return;
    }

    // Only a student has these; a teacher never reaches them because type stays
    // empty for them.
    if (formData.type === 'college') {
      if (!formData.studentNumber || !formData.course || !formData.year) {
        error = 'Please fill in all college student fields';
        loading = false;
        return;
      }
    } else if (formData.type === 'shs') {
      if (!formData.lrn || !formData.strand || !formData.grade) {
        error = 'Please fill in all SHS student fields';
        loading = false;
        return;
      }
    }

    if (formData.interests.length !== REQUIRED_INTERESTS) {
      error = `Please select exactly ${REQUIRED_INTERESTS} interests`;
      loading = false;
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      error = 'Passwords do not match';
      loading = false;
      return;
    }

    if (formData.password.length < 6) {
      error = 'Password must be at least 6 characters long';
      loading = false;
      return;
    }

    try {
      // Create user with email and password
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      // Written in the same shape as the app's signup, so a user looks the
      // same whichever side created them. The password is deliberately not
      // stored: Firebase Auth holds it, and a copy in Firestore is readable by
      // anyone who can read the users collection.
      const userData = {
        uid: user.uid,
        firstName: formData.firstName,
        middleName: formData.middleName,
        // The app writes both. surname is what the student list sorts on.
        lastName: formData.surname,
        surname: formData.surname,
        email: formData.email,
        username: formData.username,
        role: formData.role,
        interests: [...formData.interests],
        createdAt: new Date().toISOString()
      };

      if (formData.role === 'student') {
        // studentType is the app's field and what analytics reads; type is the
        // older one the student list still filters on.
        userData.studentType = formData.type === 'shs' ? 'senior-high' : 'college';
        userData.type = formData.type;
        userData.activityStatus = formData.activityStatus;

        if (formData.type === 'college') {
          userData.studentNumber = formData.studentNumber;
          userData.course = formData.course;
          userData.year = formData.year;
        } else if (formData.type === 'shs') {
          userData.lrn = formData.lrn;
          userData.strand = formData.strand;
          userData.grade = formData.grade;
        }
      } else if (formData.role === 'teacher') {
        // A teacher has no year, course or student number. The employee number
        // and department stand in their place.
        userData.employeeNumber = formData.employeeNumber;
        userData.department = formData.department;
        userData.activityStatus = formData.activityStatus;
      }

      await setDoc(doc(db, 'users', user.uid), userData);

      success = 'User registered successfully!';
      
      // Sign out the newly created user to prevent automatic login/redirect
      await signOut(auth);
      
      // Reset form
      formData = {
        firstName: '',
        middleName: '',
        surname: '',
        type: '',
        year: '',
        grade: '',
        course: '',
        strand: '',
        studentNumber: '',
        lrn: '',
        employeeNumber: '',
        department: '',
        email: '',
        username: '',
        password: '',
        confirmPassword: '',
        role: 'student',
        interests: [],
        activityStatus: 'Active'
      };

      // Clear success message after 3 seconds
      setTimeout(() => {
        success = '';
      }, 3000);

    } catch (err) {
      console.error('Registration error:', err);
      switch (err.code) {
        case 'auth/email-already-in-use':
          error = 'Email is already registered';
          break;
        case 'auth/weak-password':
          error = 'Password is too weak';
          break;
        case 'auth/invalid-email':
          error = 'Invalid email address';
          break;
        default:
          error = 'Registration failed. Please try again.';
      }
    } finally {
      loading = false;
    }
  }

  // Cancel registration
  function cancel() {
    goto('/dashboard');
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

  // Auto-uppercase name fields
  $effect(() => {
    if (formData.firstName) formData.firstName = formData.firstName.toUpperCase();
    if (formData.middleName) formData.middleName = formData.middleName.toUpperCase();
    if (formData.surname) formData.surname = formData.surname.toUpperCase();
  });
</script>

<div class="register-container">
  <!-- Header -->
  <header class="page-header">
    <div class="header-content">
      <h1>User Registration</h1>
      <nav class="breadcrumb">
        <a href="/dashboard">Dashboard</a> / Register User
      </nav>
    </div>
    <div class="header-actions">
      <button class="dashboard-btn" onclick={() => goto('/dashboard')}>Return to Dashboard</button>
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  <!-- Registration Form -->
  <main class="register-main">
    <div class="form-container">
      {#if success}
        <div class="success-message">
          {success}
        </div>
      {:else if error}
        <div class="error-message">
          {error}
        </div>
      {/if}

      <form onsubmit={handleRegister} class="registration-form">
        <div class="form-section">
          <h3>Role Selection</h3>
          <div class="form-grid">
            <div class="form-group">
              <label for="role">Role *</label>
              <select 
                id="role" 
                bind:value={formData.role} 
                required
                disabled={loading}
              >
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3>Personal Information</h3>
          <div class="form-grid">
            <div class="form-group">
              <label for="firstName">First Name *</label>
              <input 
                type="text" 
                id="firstName" 
                bind:value={formData.firstName} 
                required
                disabled={loading}
              />
            </div>
            
            <div class="form-group">
              <label for="middleName">Middle Name</label>
              <input 
                type="text" 
                id="middleName" 
                bind:value={formData.middleName}
                disabled={loading}
              />
            </div>
            
            <div class="form-group">
              <label for="surname">Surname *</label>
              <input 
                type="text" 
                id="surname" 
                bind:value={formData.surname} 
                required
                disabled={loading}
              />
            </div>
          </div>
        </div>

        {#if formData.role === 'student'}
          <div class="form-section">
            <h3>Student Information</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="type">Student Type *</label>
                <select 
                  id="type" 
                  bind:value={formData.type} 
                  required
                  disabled={loading}
                >
                  <option value="">Select Type</option>
                  <option value="college">College</option>
                  <option value="shs">Senior High School</option>
                </select>
              </div>
            </div>
          
            {#if formData.type === 'college'}
              <div class="form-grid" style="margin-top: 20px;">
                <div class="form-group">
                  <label for="studentNumber">Student Number *</label>
                  <input 
                    type="text" 
                    id="studentNumber" 
                    bind:value={formData.studentNumber} 
                    required
                    disabled={loading}
                  />
                </div>
              
                <div class="form-group">
                  <label for="course">Course *</label>
                  <select 
                    id="course" 
                    bind:value={formData.course} 
                    required
                    disabled={loading}
                  >
                    <option value="">Select Course</option>
                    <option value="BSCS">BSCS - Bachelor of Science in Computer Science</option>
                    <option value="BSIT">BSIT - Bachelor of Science in Information Technology</option>
                    <option value="BSBA">BSBA - Bachelor of Science in Business Administration</option>
                    <option value="BSIS">BSIS - Bachelor of Science in Information Systems</option>
                  </select>
                </div>
              
                <div class="form-group">
                  <label for="year">Year *</label>
                  <select 
                    id="year" 
                    bind:value={formData.year} 
                    required
                    disabled={loading}
                  >
                    <option value="">Select Year</option>
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                    <option value="5th Year">5th Year</option>
                  </select>
                </div>
              </div>
            {:else if formData.type === 'shs'}
              <div class="form-grid" style="margin-top: 20px;">
                <div class="form-group">
                  <label for="lrn">Learner's Reference Number (LRN) *</label>
                  <input 
                    type="text" 
                    id="lrn" 
                    bind:value={formData.lrn} 
                    required
                    disabled={loading}
                  />
                </div>
              
                <div class="form-group">
                  <label for="strand">Strand *</label>
                  <select 
                    id="strand" 
                    bind:value={formData.strand} 
                    required
                    disabled={loading}
                  >
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
              
                <div class="form-group">
                  <label for="grade">Grade *</label>
                  <select 
                    id="grade" 
                    bind:value={formData.grade} 
                    required
                    disabled={loading}
                  >
                    <option value="">Select Grade</option>
                    <option value="Grade 11">Grade 11</option>
                    <option value="Grade 12">Grade 12</option>
                  </select>
                </div>
              </div>
            {/if}
          </div>

          {#if formData.role === 'student' || formData.role === 'teacher'}
            <div class="form-group" style="margin-top: 20px;">
              <label for="activityStatus">Activity Status *</label>
              <select 
                id="activityStatus" 
                bind:value={formData.activityStatus} 
                required
                disabled={loading}
              >
                <option value="Active">Active</option>
                <option value="Graduated">Graduated</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          {/if}
        {/if}

        {#if formData.role === 'teacher'}
          <div class="form-section">
            <h3>Teacher Information</h3>
            <div class="form-grid">
              <div class="form-group">
                <label for="employeeNumber">Employee Number *</label>
                <input
                  type="text"
                  id="employeeNumber"
                  bind:value={formData.employeeNumber}
                  required
                  disabled={loading}
                />
              </div>

              <div class="form-group">
                <label for="department">Department *</label>
                <select id="department" bind:value={formData.department} required disabled={loading}>
                  <option value="">Select Department</option>
                  {#each DEPARTMENTS as department}
                    <option value={department}>{department}</option>
                  {/each}
                </select>
              </div>
            </div>
          </div>
        {/if}

        <div class="form-section">
          <h3>Account Information</h3>
          <div class="form-grid">
            <div class="form-group">
              <label for="email">Email Address *</label>
              <input 
                type="email" 
                id="email" 
                bind:value={formData.email} 
                required
                disabled={loading}
              />
            </div>
            
            <div class="form-group">
              <label for="username">Username *</label>
              <input 
                type="text" 
                id="username" 
                bind:value={formData.username} 
                required
                disabled={loading}
              />
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3>Interests</h3>
          <p class="section-hint">
            Pick exactly {REQUIRED_INTERESTS}. These are the subjects books carry, and the
            app uses them the same way.
          </p>
          <div class="interest-grid">
            {#each DEFAULT_SUBJECTS as subject}
              <label
                class="interest-option"
                class:disabled={loading ||
                  (formData.interests.length >= REQUIRED_INTERESTS &&
                    !formData.interests.includes(subject))}
              >
                <input
                  type="checkbox"
                  value={subject}
                  bind:group={formData.interests}
                  disabled={loading ||
                    (formData.interests.length >= REQUIRED_INTERESTS &&
                      !formData.interests.includes(subject))}
                />
                <span>{subject}</span>
              </label>
            {/each}
          </div>
          <p class="section-hint">{formData.interests.length}/{REQUIRED_INTERESTS} selected</p>
        </div>

        <div class="form-section">
          <h3>Security</h3>
          <div class="form-grid">
            <div class="form-group">
              <label for="password">Password *</label>
              <div class="password-input-container">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  id="password" 
                  bind:value={formData.password} 
                  required
                  minlength="6"
                  disabled={loading}
                />
                <button 
                  type="button" 
                  class="password-toggle-btn" 
                  onclick={() => showPassword = !showPassword}
                  disabled={loading}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              <small>Minimum 6 characters</small>
            </div>
            
            <div class="form-group">
              <label for="confirmPassword">Confirm Password *</label>
              <div class="password-input-container">
                <input 
                  type={showConfirmPassword ? 'text' : 'password'} 
                  id="confirmPassword" 
                  bind:value={formData.confirmPassword} 
                  required
                  minlength="6"
                  disabled={loading}
                />
                <button 
                  type="button" 
                  class="password-toggle-btn" 
                  onclick={() => showConfirmPassword = !showConfirmPassword}
                  disabled={loading}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="cancel-btn" onclick={cancel} disabled={loading}>
            Cancel
          </button>
          <button type="submit" class="submit-btn" disabled={loading}>
            {loading ? 'Registering...' : 'Register User'}
          </button>
        </div>
      </form>
    </div>
  </main>
</div>

<style>
  @import '../style.css';

  .form-container {
    background: white;
    padding: 30px;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  }

  .section-hint {
    margin: 0 0 12px 0;
    font-size: 13px;
    color: #6f6e6a;
  }

  .interest-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
  }

  .interest-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
  }

  .interest-option:hover {
    border-color: var(--brand);
    background: var(--brand-tint);
  }

  /* Once three are picked the rest are disabled, so they should not look
     clickable. */
  .interest-option.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .interest-option input {
    width: auto;
    margin: 0;
  }

  .form-section {
    margin-bottom: 30px;
  }

  .form-section h3 {
    color: var(--text-heading);
    font-size: 0.95rem;
    font-weight: bold;
    margin: 0 0 16px 0;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-soft);
  }

  .form-group small {
    color: #666;
    font-size: 12px;
    margin-top: 5px;
  }

  .password-input-container {
    position: relative;
    display: flex;
    align-items: center;
  }

  .password-input-container input {
    flex: 1;
    padding-right: 45px;
  }

  .password-toggle-btn {
    position: absolute;
    right: 10px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
    padding: 5px;
    border-radius: 4px;
    transition: background-color 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 30px;
  }

  .password-toggle-btn:hover:not(:disabled) {
    background-color: #f0f0f0;
  }

  .password-toggle-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

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

  #firstName,
  #middleName,
  #surname {
    text-transform: uppercase;
  }
</style>
