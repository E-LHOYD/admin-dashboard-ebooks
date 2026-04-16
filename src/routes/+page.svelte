<script>
  // Import Firebase services
  import { auth, db } from '$lib/firebase'; // Firebase auth and database instances
  import { signInWithEmailAndPassword } from 'firebase/auth'; // Email/password authentication
  import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'; // Firestore operations
  import { goto } from '$app/navigation'; // SvelteKit navigation

  // Reactive state variables using Svelte 5 $state syntax
  let username = $state(''); // Stores username or email input
  let email = $state(''); // Legacy variable (not used in current implementation)
  let password = $state(''); // Stores password input
  let error = $state(''); // Stores error messages for display
  let showPassword = $state(false); // Controls password visibility toggle

  /**
   * Handles user login by supporting both username and email authentication
   * 
   * Process:
   * 1. Determines if input is email (contains '@') or username
   * 2. If email: uses directly for Firebase Authentication
   * 3. If username: queries Firestore 'admin' collection to find matching username
   * 4. Retrieves email from Firestore document
   * 5. Authenticates with Firebase using the resolved email and password
   * 6. On success: redirects to dashboard
   * 7. On failure: displays appropriate error message
   */
  async function login() {
    try {
      let loginEmail = '';
      
      console.log('Login attempt with:', username);
      
      // Determine if input is email or username based on '@' presence
      if (username.includes('@')) {
        // Direct email login - skip Firestore lookup
        loginEmail = username;
        console.log('Using email directly:', loginEmail);
      } else {
        // Username login - query Firestore to find corresponding email
        console.log('Looking up username in Firestore:', username);
        
        // Create query to find admin document where username field matches input
        const adminQuery = query(
          collection(db, 'admin'), 
          where('username', '==', username)
        );
        
        // Execute query and get results
        const querySnapshot = await getDocs(adminQuery);
        console.log('Query results count:', querySnapshot.size);
        
        // Check if username was found in Firestore
        if (querySnapshot.empty) {
          console.log('User not found in Firestore');
          error = "User not found";
          return; // Exit function early if user not found
        }
        
        // Get the first (and only) matching document
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        console.log('User data:', userData);
        
        // Extract email from Firestore document for Firebase Authentication
        loginEmail = userData.email;
        console.log('Found email:', loginEmail);
      }
      
      // Authenticate with Firebase using the resolved email and provided password
      console.log('Attempting Firebase Auth with email:', loginEmail);
      await signInWithEmailAndPassword(auth, loginEmail, password);
      console.log('Login successful');
      
      // Redirect to dashboard on successful authentication
      goto('/dashboard');
    } catch (e) {
      // Handle authentication errors (wrong password, Firebase issues, etc.)
      console.error('Login error:', e);
      error = "Invalid username/email or password";
    }
  }

  /**
   * Toggles password visibility between text and password input types
   */
  function togglePassword() {
    showPassword = !showPassword;
  }
</script>

<div class="container">
  <div class="card">
    <h1>GD Library Portal</h1>
    <p class="subtitle">Admin Login System</p>

    <input
      type="text"
      placeholder="Enter username or email"
      bind:value={username}
    />

    <div class="password-container">
      <input
        type={showPassword ? 'text' : 'password'}
        placeholder="Enter password"
        bind:value={password}
      />
      <button 
        type="button" 
        class="password-toggle" 
        onclick={togglePassword}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
      >
        {#if showPassword}
          <!-- Eye closed icon -->
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        {:else}
          <!-- Eye open icon -->
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        {/if}
      </button>
    </div>

    <button onclick={login}>Sign In</button>

    {#if error}
      <p class="error">{error}</p>
    {/if}
  </div>
</div>

<style>
  .container {
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #f5f6f8;
    font-family: sans-serif;
  }

  .card {
    background: white;
    padding: 30px;
    border-radius: 10px;
    width: 300px;
    display: flex;
    flex-direction: column;
  }

  input {
    margin-top: 10px;
    padding: 10px;
  }

  .password-container {
    position: relative;
    margin-top: 10px;
  }

  .password-container input {
    width: 100%;
    padding-right: 40px;
    box-sizing: border-box;
  }

  .password-toggle {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    color: #666;
    padding: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .password-toggle:hover {
    color: #333;
  }

  button {
    margin-top: 15px;
    padding: 10px;
    background: black;
    color: white;
    border: none;
    cursor: pointer;
  }

  .subtitle {
    color: #666;
    margin-bottom: 20px;
    font-size: 14px;
  }

  .error {
    color: red;
    margin-top: 10px;
  }
</style>