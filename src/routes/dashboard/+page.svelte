<script>
  import { auth, db } from '$lib/firebase';
  import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';

  // Reactive state variables
  let totalUsers = $state(0);
  let totalBooks = $state(0);
  let activeUsers = $state(0);
  let loading = $state(true);

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
  initializeDashboard();
</script>

<div class="dashboard-container">
  <!-- Header -->
  <header class="dashboard-header">
    <h1>GD Library Dashboard</h1>
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
          <div class="card-icon">👥</div>
          <h3>Students Management</h3>
          <p>Register and manage student accounts</p>
          <div class="card-stats">{totalUsers} registered students</div>
        </a>
        
        <a href="/dashboard/books" class="management-card">
          <div class="card-icon">📚</div>
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
  
  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #eee;
  }

  .dashboard-header h1 {
    color: #333;
    margin: 0;
  }

  .header-actions {
    display: flex;
    gap: 10px;
  }

  .register-btn {
    background: #28a745;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
  }

  .register-btn:hover {
    background: #218838;
  }

  
  .management-section {
    margin-bottom: 40px;
  }

  .management-section h2 {
    color: #333;
    margin-bottom: 20px;
  }

  .management-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
  }

  .management-card {
    background: white;
    padding: 30px;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    text-decoration: none;
    color: inherit;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    display: block;
  }

  .management-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 15px rgba(0,0,0,0.2);
  }

  .card-icon {
    font-size: 3em;
    margin-bottom: 15px;
  }

  .management-card h3 {
    margin: 0 0 10px 0;
    color: #333;
  }

  .management-card p {
    color: #666;
    margin: 0 0 15px 0;
  }

  .card-stats {
    background: #f8f9fa;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 14px;
    color: #007bff;
    font-weight: 600;
  }
</style>
