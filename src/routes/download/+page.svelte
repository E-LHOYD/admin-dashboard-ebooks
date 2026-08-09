<script>
  // Simple download page for the APK
  import { onMount } from 'svelte';

  let downloading = $state(false);
  let error = $state(false);

  function downloadApp() {
    downloading = true;
    try {
      // The APK should be served from the static folder
      window.location.href = '/app.apk';
    } catch (e) {
      error = true;
      console.error("Download failed:", e);
    }
  }

  onMount(() => {
    // Wait a moment before auto-downloading to show the UI
    setTimeout(() => {
      downloadApp();
    }, 1000);
  });
</script>

<div class="download-container">
  <h1>Download Gardner E-Books App</h1>
  
  {#if error}
    <div class="error-message">
      <p>APK file not found. Please build the app and place app.apk in the static folder.</p>
      <p>Contact administrator for the latest APK.</p>
    </div>
  {:else if downloading}
    <p>Starting download...</p>
    <div class="spinner"></div>
  {:else}
    <button onclick={downloadApp}>Download APK</button>
  {/if}
  
  <p class="instructions">
    <strong>Installation Instructions:</strong><br>
    1. Download the APK file<br>
    2. Enable "Install from unknown sources" in your device settings<br>
    3. Open the downloaded APK file<br>
    4. Install the app<br>
    5. The app will automatically check for updates on startup
  </p>
  
  <p class="note">
    <strong>Note:</strong> After installation, the app will automatically check for updates
    when you open it. No need to download again - updates will be handled automatically!
  </p>
</div>

<style>
  .download-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 20px;
    text-align: center;
  }

  h1 {
    color: #033047;
    margin-bottom: 20px;
    font-size: 1.5rem;
  }

  button {
    background: #033047;
    color: white;
    border: none;
    padding: 15px 30px;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
    margin: 20px 0;
  }

  button:hover {
    background: #04405c;
  }

  .instructions {
    max-width: 500px;
    color: #666;
    line-height: 1.6;
    margin: 20px 0;
    font-size: 0.875rem;
  }

  .note {
    max-width: 500px;
    color: #033047;
    background: #e3f2fd;
    padding: 15px;
    border-radius: 8px;
    margin: 20px 0;
    font-size: 0.875rem;
  }

  .error-message {
    background: #ffebee;
    color: #c62828;
    padding: 20px;
    border-radius: 8px;
    margin: 20px 0;
  }

  .spinner {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #033047;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin: 20px auto;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>