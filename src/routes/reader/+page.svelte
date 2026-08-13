<script>
  import { onMount } from 'svelte';
  import { isBookFileUrl } from '$lib/supabase';

  // Standalone PDF reader.
  //
  // The mobile app points a WebView at /reader?url=<storage url>. The page
  // renders the PDF itself because Android's WebView has no built-in PDF
  // viewer — handing it a PDF URL directly shows nothing at all.

  // pdf.js is bundled rather than pulled from a CDN, so the reader keeps
  // working on networks that block third-party hosts. The `legacy` build is
  // used because it targets older engines, which matters for Android WebView.

  let status = $state('Loading book…');
  let errorMessage = $state('');
  let pageCount = $state(0);
  let pagesRendered = $state(0);
  let currentPage = $state(1);
  let container = $state();
  let previewMode = $state(false);
  let targetPage = $state(1);

  // The mobile app polls window.__readerProgress from the native side; it
  // cannot observe scrolling inside this WebView any other way.
  function publishProgress(page, total) {
    currentPage = page;
    const percent = total > 0 ? (page / total) * 100 : 0;
    window.__readerProgress = { page, total, percent };
  }

  // Which page occupies most of the viewport right now.
  function pageInView() {
    const canvases = container?.querySelectorAll('canvas.pdf-page') ?? [];
    let best = 1;
    let bestVisible = -1;

    for (let i = 0; i < canvases.length; i++) {
      const r = canvases[i].getBoundingClientRect();
      const visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      if (visible > bestVisible) {
        bestVisible = visible;
        best = i + 1;
      }
    }
    return best;
  }

  let scrollQueued = false;
  function onScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      if (pageCount > 0) publishProgress(pageInView(), pageCount);
    });
  }

  async function renderPage(pdf, pageNumber) {
    const page = await pdf.getPage(pageNumber);

    // Fit the page to the viewport width, then multiply by the device pixel
    // ratio so text stays sharp on phone screens.
    const unscaled = page.getViewport({ scale: 1 });
    const targetWidth = container.clientWidth || window.innerWidth;
    const cssScale = targetWidth / unscaled.width;
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: cssScale * outputScale });

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page';
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    container.appendChild(canvas);

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    pagesRendered = pageNumber;
  }

  onMount(async () => {
    const fileUrl = new URLSearchParams(window.location.search).get('url');
    const preview = new URLSearchParams(window.location.search).get('preview') === 'true';
    const pageParam = new URLSearchParams(window.location.search).get('page');
    previewMode = preview;
    targetPage = pageParam ? parseInt(pageParam, 10) : 1;

    if (!fileUrl) {
      errorMessage = 'No book link was provided.';
      status = '';
      return;
    }

    // Only ever render files from this project's own storage, so the page
    // cannot be used to load an arbitrary document from another host.
    if (!isBookFileUrl(fileUrl)) {
      errorMessage = 'That book link is not recognised.';
      status = '';
      return;
    }

    try {
      // Imported here rather than at the top of the module: pdf.js touches
      // browser globals, so it must not be evaluated during server rendering.
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

      status = 'Fetching book…';

      // Loaded straight from storage: no server-side proxy in the way.
      const loadingTask = pdfjsLib.getDocument({ url: fileUrl, withCredentials: false });

      loadingTask.onProgress = ({ loaded, total }) => {
        if (total) {
          status = `Downloading… ${Math.round((loaded / total) * 100)}%`;
        }
      };

      const pdf = await loadingTask.promise;
      pageCount = pdf.numPages;
      // Keep the loading screen up while the first page is drawn — clearing
      // it here would show a blank dark screen until the canvas appears.
      status = 'Preparing pages…';

      // Publish immediately so the app shows 1 / N rather than 0% while the
      // remaining pages are still being drawn.
      publishProgress(1, pageCount);
      window.addEventListener('scroll', onScroll, { passive: true });

      // Render sequentially so the first page appears as soon as possible
      // instead of waiting for the whole book.
      // In preview mode, only render the first page
      const maxPages = previewMode ? 1 : pdf.numPages;
      for (let i = 1; i <= maxPages; i++) {
        await renderPage(pdf, i);
        // First page is visible — drop the loading screen; the bottom-right
        // "rendering N / M" counter covers the rest of the render.
        if (i === 1) status = '';
      }

      // Scroll to target page if specified (not in preview mode)
      if (targetPage > 1 && !previewMode) {
        // Wait for pages to render, then scroll
        setTimeout(() => {
          const targetCanvas = container?.querySelector(`.pdf-page:nth-child(${targetPage})`);
          if (targetCanvas) {
            targetCanvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
            currentPage = targetPage;
            publishProgress(targetPage, pageCount);
          }
        }, 500);
      }
    } catch (e) {
      console.error('Reader error:', e);
      status = '';
      errorMessage = e?.message || 'This book could not be opened.';
    }
  });
</script>

<svelte:head>
  <title>Reader</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
</svelte:head>

{#if status}
  <div class="overlay">
    <div class="spinner"></div>
    <div>{status}</div>
  </div>
{/if}

{#if errorMessage}
  <div class="overlay error">
    <p>{errorMessage}</p>
  </div>
{/if}

{#if pageCount > 0 && !previewMode}
  <div class="page-counter">
    {pagesRendered < pageCount ? `rendering ${pagesRendered} / ${pageCount}` : `${currentPage} / ${pageCount}`}
  </div>
{/if}

<div class="pages" bind:this={container}></div>

<style>
  :global(body) {
    margin: 0;
    background: #33383d;
  }

  .pages {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
  }

  .pages :global(.pdf-page) {
    display: block;
    background: #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background: #33383d;
    padding: 32px 20px;
    text-align: center;
    color: #e8e8e8;
    font-family: system-ui, -apple-system, Arial, sans-serif;
    font-size: 15px;
  }

  .spinner {
    width: 38px;
    height: 38px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: #ffd700;
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .overlay.error {
    color: #ffb4b4;
  }

  .page-counter {
    position: fixed;
    right: 10px;
    bottom: 10px;
    padding: 4px 10px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-family: system-ui, -apple-system, Arial, sans-serif;
    font-size: 12px;
  }
</style>
