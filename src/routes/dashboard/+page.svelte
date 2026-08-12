<script>
  import { auth, db } from '$lib/firebase';
  import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
  import { signOut, onAuthStateChanged } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import {
    latestActivityByUser,
    countActiveSince,
    minutesAgo,
    ACTIVE_NOW_MINUTES
  } from '$lib/activity';

  // Reactive state variables
  let totalUsers = $state(0);
  let totalBooks = $state(0);
  let activeNow = $state(0);
  let loading = $state(true);
  let currentUser = $state(null);
  let unsubscribe = $state(null);

  // Get user data from Firestore
  async function getUserData(email) {
    try {
      const adminRef = collection(db, 'admin');
      const q = query(adminRef, where('email', '==', email));
      const querySnapshot = await getDocs(q);
      
      console.log('Admin query snapshot empty:', querySnapshot.empty);
      console.log('Admin query snapshot size:', querySnapshot.size);
      
      if (!querySnapshot.empty) {
        const adminData = querySnapshot.docs[0].data();
        console.log('Admin data from Firestore:', adminData);
        console.log('Username field:', adminData.username);
        
        if (adminData.username) {
          currentUser = { ...currentUser, username: adminData.username };
        } else {
          console.log('Username field is missing or empty, using email');
          currentUser = { ...currentUser, username: adminData.email };
        }
      } else {
        console.log('No admin found with email:', email);
        // Fallback: get all admins and find matching email
        console.log('Trying fallback: fetching all admins to find match');
        const allAdminsSnapshot = await getDocs(adminRef);
        console.log('All admins count:', allAdminsSnapshot.size);
        
        allAdminsSnapshot.docs.forEach((doc) => {
          const adminData = doc.data();
          console.log('Admin document:', adminData);
          console.log('Document email field:', adminData.email);
          console.log('Document email matches?', adminData.email === email);
        });
      }
    } catch (error) {
      console.error('Error fetching admin data:', error);
    }
  }

  // Set up auth state listener
  function setupAuthListener() {
    unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Check if user is an admin
        const adminRef = collection(db, 'admin');
        const q = query(adminRef, where('email', '==', user.email));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          // User is not an admin, redirect to home
          console.log('User is not an admin, redirecting...');
          await signOut(auth);
          goto('/');
          return;
        }
        
        // User is an admin, proceed
        currentUser = user;
        await getUserData(user.email);
      } else {
        currentUser = null;
        goto('/');
      }
    });
  }

  // Initialize dashboard data
  async function initializeDashboard() {
    try {
      console.log('Fetching dashboard data...');
      console.log('Firebase db instance:', db);
      
      // Get total users count
      try {
        console.log('Attempting to fetch users collection...');
        const usersCollectionRef = collection(db, 'users');
        console.log('Collection reference:', usersCollectionRef);
        
        const usersSnapshot = await getDocs(usersCollectionRef);
        totalUsers = usersSnapshot.size;
        console.log('Users collection size:', totalUsers);
        console.log('Users snapshot empty:', usersSnapshot.empty);
        console.log('Users snapshot metadata:', usersSnapshot.metadata);
        console.log('Users snapshot docs length:', usersSnapshot.docs.length);
        
        // Debug: Log user data if any
        if (usersSnapshot.docs.length > 0) {
          console.log('Found user documents:');
          usersSnapshot.docs.forEach((doc, index) => {
            console.log(`User ${index + 1}:`, {
              id: doc.id,
              exists: doc.exists(),
              data: doc.data()
            });
          });
        } else {
          console.log('No users found in collection - checking if collection exists...');
          
          // Try a different approach - check if we can access the collection at all
          try {
            const testDoc = await getDoc(doc(db, 'users', 'test'));
            console.log('Test doc access result:', testDoc.exists());
          } catch (testError) {
            console.log('Test doc access failed:', testError.message);
          }
        }
      } catch (userError) {
        console.error('Error fetching users:', userError);
        console.error('User error code:', userError.code);
        console.error('User error message:', userError.message);
        console.error('User error details:', userError.details);
      }

      // Get total books count
      try {
        const booksCountSnapshot = await getDocs(collection(db, 'books'));
        totalBooks = booksCountSnapshot.size;
        console.log('Books collection size:', totalBooks);
      } catch (bookError) {
        console.error('Error fetching books:', bookError);
      }

      // Active users, measured rather than assumed. Previously this was
      // totalUsers * 0.3 with a comment admitting it was a placeholder.
      try {
        const [usersSnapshot, progressSnapshot] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'readingProgress'))
        ]);

        const allUsers = usersSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        const progress = progressSnapshot.docs.map((d) => d.data());
        const latest = latestActivityByUser(allUsers, progress);

        activeNow = countActiveSince(latest, minutesAgo(ACTIVE_NOW_MINUTES));
      } catch (activityError) {
        console.error('Error working out active users:', activityError);
        activeNow = 0;
      }

      loading = false;
    } catch (error) {
      console.error('Error initializing dashboard:', error);
      console.error('Full error details:', error);
      loading = false;
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

  
  // Initialize on component mount
  onMount(() => {
    setupAuthListener();
    initializeDashboard();
    
    // Cleanup on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  });
</script>

<div class="dashboard-container">
  <!-- Header -->
  <header class="dashboard-header">
    <div class="header-left">
      <h1>Gardner E-Books Library Dashboard</h1>
      {#if currentUser}
        <p class="user-info">Welcome, {currentUser.username || currentUser.email}</p>
      {/if}
    </div>
    <div class="header-actions">
      <button class="register-btn" onclick={() => goto('/dashboard/register')}>Register User</button>
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  {#if loading}
    <div class="loading">Loading dashboard...</div>
  {:else}
    <!-- Statistics Cards -->
    <section class="stats-section">
      <h2>Overview</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div class="stat-number">{totalUsers}</div>
          <div class="stat-label">Total Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
          </div>
          <div class="stat-number">{totalBooks}</div>
          <div class="stat-label">Books Uploaded</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
          </div>
          <div class="stat-number">{activeNow}</div>
          <div class="stat-label">Active users (last {ACTIVE_NOW_MINUTES} min)</div>
        </div>
      </div>
    </section>

    <!-- Management Navigation -->
    <section class="management-section">
      <h2>Management</h2>
      <div class="management-grid">
        <a href="/dashboard/studentlist" class="management-card">
          <div class="card-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <h3>Users Management</h3>
          <p>Register and manage user accounts</p>
          <div class="card-stats">{totalUsers} registered users</div>
        </a>

        <a href="/dashboard/books" class="management-card">
          <div class="card-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
          </div>
          <h3>Books Management</h3>
          <p>Upload, edit, and manage library books</p>
          <div class="card-stats">{totalBooks} books available</div>
        </a>

        <a href="/dashboard/analytics" class="management-card">
          <div class="card-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
          </div>
          <h3>Analytics</h3>
          <p>Reading activity, subjects, and student breakdown</p>
          <div class="card-stats">Usage across the library</div>
        </a>
      </div>
    </section>
  {/if}
</div>

<style>
  @import './style.css';

  /* Only what is specific to this page. The header, buttons, stat cards and
     section headings now come from the shared stylesheet. */

  .header-left {
    display: flex;
    flex-direction: column;
  }

  .user-info {
    color: var(--text-muted);
    margin: 5px 0 0 0;
    font-size: 0.875rem;
  }

  .management-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
  }

  .management-card {
    background: white;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 30px;
    text-decoration: none;
    color: inherit;
    display: block;
    box-shadow: var(--shadow);
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  }

  .management-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    border-color: var(--brand);
  }

  .management-card h3 {
    margin: 0 0 10px 0;
    color: var(--text-heading);
    font-size: 1.125rem;
    font-weight: bold;
  }

  .management-card p {
    color: var(--text-muted);
    margin: 0 0 15px 0;
    font-size: 0.875rem;
  }

  .card-stats {
    background: var(--surface-alt);
    padding: 16px 20px;
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    color: var(--text-heading);
    font-weight: 600;
  }

  .stat-icon {
    color: var(--brand);
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .card-icon {
    color: var(--brand);
    margin-bottom: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
