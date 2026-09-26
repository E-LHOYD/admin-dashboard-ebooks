<!--
    Wraps every dashboard page: the page itself, then the footer.
-->
<script>
  let { children } = $props();
</script>

{@render children()}

<footer class="gd-footer">
  <p>© 2026 GD-Library Admin Portal. All rights reserved.</p>
</footer>

<style>
  .gd-footer {
    max-width: 1600px;
    margin: 0 auto;
    padding: 20px 15px;
    border-top: 1px solid var(--border);
    text-align: center;
    font-family: Arial, sans-serif;
    font-size: 0.875rem;
    color: var(--text-muted);
    background: white;
  }

  .gd-footer p {
    margin: 0;
  }
</style>
