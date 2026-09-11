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
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    border-top: 2px solid #cccccc;
    text-align: center;
    font-family: Arial, sans-serif;
    font-size: 13px;
    color: #666666;
    background: white;
  }

  .gd-footer p {
    margin: 0;
  }
</style>
