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

<div class="min-h-screen bg-white flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <!-- Logo/Brand Section -->
    <div class="text-center mb-8">
      <h1 class="text-xl font-bold text-gray-900 mb-2">Gardner E-Books Library Portal</h1>
      <p class="text-gray-600 text-sm">Admin Login</p>
    </div>
    
    <!-- App Download Link for Users -->
    <div class="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
      <p class="text-sm text-blue-800 mb-2">
        <strong>📱 Mobile App</strong>
      </p>
      <a 
        href="/download" 
        class="block w-full bg-blue-600 text-white text-center py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm"
      >
        Download Gardner E-Books App
      </a>
    </div>

    <!-- Login Card -->
    <div class="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
      <form onsubmit={(e) => { e.preventDefault(); login(); }} class="space-y-6">
        <!-- Username/Email Input -->
        <div>
          <label for="username" class="block text-sm font-medium text-gray-700 mb-2">
            Username or Email
          </label>
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            </div>
            <input
              id="username"
              type="text"
              placeholder="Enter your username or email"
              bind:value={username}
              class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 outline-none text-gray-900 placeholder-gray-400"
            />
          </div>
        </div>

        <!-- Password Input -->
        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 mb-2">
            Password
          </label>
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              bind:value={password}
              class="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 outline-none text-gray-900 placeholder-gray-400"
            />
            <button
              type="button"
              onclick={togglePassword}
              class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {#if showPassword}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                </svg>
              {:else}
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
              {/if}
            </button>
          </div>
        </div>

        <!-- Error Message -->
        {#if error}
          <div class="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <svg class="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p class="text-sm text-red-700">{error}</p>
          </div>
        {/if}

        <!-- Submit Button -->
        <button
          type="submit"
          class="w-full bg-[#033047] text-white py-3 px-4 rounded-lg font-semibold hover:bg-[#04405c] transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
        >
          Sign In
        </button>
      </form>

      <!-- Footer -->
      <div class="mt-6 text-center">
        <p class="text-sm text-gray-500">
          Secure admin access for Gardner E-Books Library Portal
        </p>
      </div>
    </div>

    <!-- Copyright -->
    <p class="text-center text-gray-500 text-sm mt-8">
      © 2025 Gardner E-Books Library Portal. All rights reserved.
    </p>
  </div>
</div>