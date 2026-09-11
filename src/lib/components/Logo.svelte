<!--
    The GD-Library mark: three book spines, the last one leaning, as in the
    mobile app and the web library. With `label` it is followed by the portal's
    name, as the brand line at the top of every admin page.
-->
<script>
  /** Show "GD-Library Admin Portal" beside the mark. */
  let { label = true, size = 'normal' } = $props();
</script>

<span class="gd-logo" class:large={size === 'large'}>
  <span class="gd-mark" aria-hidden="true"><i></i><i></i><i></i></span>
  {#if label}<span class="gd-name">GD-Library <span class="gd-sub">Admin Portal</span></span>{/if}
</span>

<style>
  .gd-logo {
    display: inline-flex;
    align-items: flex-end;
    gap: 10px;
    color: #201e1d;
    font-family: Archivo, Arial, sans-serif;
  }

  .gd-mark {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
  }

  .gd-mark i {
    display: block;
    width: 5px;
    background: #201e1d;
  }

  .gd-mark i:nth-child(1) { height: 22px; }
  .gd-mark i:nth-child(2) { height: 17px; }
  .gd-mark i:nth-child(3) {
    height: 19px;
    background: #033047;
    transform: rotate(8deg);
    transform-origin: bottom;
  }

  .gd-name {
    font-size: 15px;
    font-weight: 700;
    line-height: 1;
  }

  .gd-sub {
    color: #033047;
  }

  .large {
    gap: 14px;
  }

  .large .gd-mark { gap: 3px; }
  .large .gd-mark i { width: 8px; }
  .large .gd-mark i:nth-child(1) { height: 36px; }
  .large .gd-mark i:nth-child(2) { height: 28px; }
  .large .gd-mark i:nth-child(3) { height: 31px; }
  .large .gd-name { font-size: 22px; }
</style>
