<script>
  import { auth, db } from '$lib/firebase';
  import { createUserWithEmailAndPassword } from 'firebase/auth';
  import { collection, doc, setDoc } from 'firebase/firestore';
  import { goto } from '$app/navigation';

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
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    role: 'Student'
  });

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
    if (formData.role === 'Student' && !formData.type) {
      error = 'Please select student type (College or SHS)';
      loading = false;
      return;
    }

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

      // Create user document in Firestore
      const userData = {
        firstName: formData.firstName,
        middleName: formData.middleName,
        surname: formData.surname,
        email: formData.email,
        username: formData.username,
        password: formData.password, // SECURITY RISK: Plain text password
        role: formData.role,
        createdAt: new Date().toISOString()
      };

      // Add student-specific fields if role is Student
      if (formData.role === 'Student') {
        userData.type = formData.type;
        
        if (formData.type === 'college') {
          userData.studentNumber = formData.studentNumber;
          userData.course = formData.course;
          userData.year = formData.year;
        } else if (formData.type === 'shs') {
          userData.lrn = formData.lrn;
          userData.strand = formData.strand;
          userData.grade = formData.grade;
        }
      }

      await setDoc(doc(db, 'users', user.uid), userData);

      success = 'User registered successfully!';
      
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
        email: '',
        username: '',
        password: '',
        confirmPassword: '',
        role: 'Student'
      };

      // Redirect after 2 seconds
      setTimeout(() => {
        goto('/dashboard');
      }, 2000);

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
      <button class="cancel-btn" onclick={cancel}>Cancel</button>
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
                  <option value="BSBA">BSBA - Bachelor of Science in Business Administration</option>
                  <option value="BSIT">BSIT - Bachelor of Science in Information Technology</option>
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
                  <option value="SPORTS">SPORTS</option>
                  <option value="ARTS & DESIGN">ARTS & DESIGN</option>
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
            
            <div class="form-group">
              <label for="role">Role *</label>
              <select 
                id="role" 
                bind:value={formData.role} 
                required
                disabled={loading}
              >
                <option value="Student">Student</option>
                <option value="Teacher">Teacher</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
          </div>
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

  .register-container {
    max-width: 800px;
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

  .form-container {
    background: white;
    padding: 30px;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  }

  .success-message {
    background: #d4edda;
    color: #155724;
    padding: 15px;
    border-radius: 6px;
    margin-bottom: 20px;
    border: 1px solid #c3e6cb;
  }

  .error-message {
    background: #f8d7da;
    color: #721c24;
    padding: 15px;
    border-radius: 6px;
    margin-bottom: 20px;
    border: 1px solid #f5c6cb;
  }

  .form-section {
    margin-bottom: 30px;
  }

  .form-section h3 {
    color: #333;
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 1px solid #eee;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
  }

  .form-group label {
    color: #555;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .form-group input,
  .form-group select {
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    transition: border-color 0.3s ease;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
  }

  .form-group input:disabled,
  .form-group select:disabled {
    background: #f8f9fa;
    cursor: not-allowed;
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

  .form-actions {
    display: flex;
    gap: 15px;
    justify-content: flex-end;
    margin-top: 30px;
    padding-top: 20px;
    border-top: 1px solid #eee;
  }

  .cancel-btn {
    background: #6c757d;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.3s ease;
  }

  .cancel-btn:hover:not(:disabled) {
    background: #5a6268;
  }

  .cancel-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .submit-btn {
    background: #28a745;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.3s ease;
  }

  .submit-btn:hover:not(:disabled) {
    background: #218838;
  }

  .submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
