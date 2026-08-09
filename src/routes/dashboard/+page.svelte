<script>
  import { auth, db } from '$lib/firebase';
  import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
  import { signOut, onAuthStateChanged } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  // Reactive state variables
  let totalUsers = $state(0);
  let totalBooks = $state(0);
  let activeUsers = $state(0);
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

      // For now, set active users to a reasonable number
      // In a real app, you'd track this with presence or last login
      activeUsers = Math.floor(totalUsers * 0.3); // Assume 30% are active

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
      <button class="download-btn" onclick={() => goto('/download')}>Download App</button>
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
          <div class="stat-number">{totalUsers}</div>
          <div class="stat-label">Total Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">{totalBooks}</div>
          <div class="stat-label">Books Uploaded</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">{activeUsers}</div>
          <div class="stat-label">Active Users</div>
        </div>
      </div>
    </section>

    <!-- Management Navigation -->
    <section class="management-section">
      <h2>Management</h2>
      <div class="management-grid">
        <a href="/dashboard/studentlist" class="management-card">
          <h3>Students Management</h3>
          <p>Register and manage student accounts</p>
          <div class="card-stats">{totalUsers} registered students</div>
        </a>
        
        <a href="/dashboard/books" class="management-card">
          <h3>Books Management</h3>
          <p>Upload, edit, and manage library books</p>
          <div class="card-stats">{totalBooks} books available</div>
        </a>
      </div>
    </section>
  {/if}
</div>

<style>
  @import './style.css';
  
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

  .download-btn {
    background: #28a745;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: bold;
    width: auto;
  }

  .download-btn:hover {
    background: #218838;
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

  .management-section {
    margin-bottom: 40px;
  }

  .management-section h2 {
    color: #033047;
    font-size: 1rem;
    font-weight: bold;
    margin-bottom: 20px;
  }

  .management-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
  }

  .management-card {
    background: white;
    border: 1px solid #ccc;
    border-radius: 8;
    padding: 30px;
    text-decoration: none;
    color: inherit;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    display: block;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .management-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    border-color: #033047;
  }

  .management-card h3 {
    margin: 0 0 10px 0;
    color: #033047;
    font-size: 1.125rem;
    font-weight: bold;
  }

  .management-card p {
    color: #666;
    margin: 0 0 15px 0;
    font-size: 0.875rem;
  }

  .card-stats {
    background: #f8f9fa;
    padding: 16px 20px;
    border-radius: 6px;
    font-size: 0.875rem;
    color: #033047;
    font-weight: 600;
  }
</style>
