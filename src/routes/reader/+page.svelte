<script>
  import { onMount } from 'svelte';

  // Standalone PDF reader.
  //
  // The mobile app points a WebView at /reader?url=<mega link>. This page
  // fetches the decrypted bytes from /api/mega/file and renders them with
  // pdf.js. It has to render the PDF itself because Android's WebView has no
  // built-in PDF viewer — handing it a PDF URL directly shows nothing.

  // pdf.js is bundled rather than pulled from a CDN, so the reader keeps
  // working on networks that block third-party hosts. The `legacy` build is
  // used because it targets older engines, which matters for Android WebView.

  let status = $state('Loading book…');
  let errorMessage = $state('');
  let pageCount = $state(0);
  let pagesRendered = $state(0);
  let container = $state();

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

    if (!fileUrl) {
      errorMessage = 'No book link was provided.';
      status = '';
      return;
    }

    try {
      // Imported here rather than at the top of the module: pdf.js touches
      // browser globals, so it must not be evaluated during server rendering.
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

      status = 'Fetching book from MEGA…';

      const loadingTask = pdfjsLib.getDocument({
        url: `/api/mega/file?url=${encodeURIComponent(fileUrl)}`,
        withCredentials: false
      });

      loadingTask.onProgress = ({ loaded, total }) => {
        if (total) {
          status = `Downloading… ${Math.round((loaded / total) * 100)}%`;
        }
      };

      const pdf = await loadingTask.promise;
      pageCount = pdf.numPages;
      status = '';

      // Render sequentially so the first page appears as soon as possible
      // instead of waiting for the whole book.
      for (let i = 1; i <= pdf.numPages; i++) {
        await renderPage(pdf, i);
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
  <div class="overlay">{status}</div>
{/if}

{#if errorMessage}
  <div class="overlay error">
    <p>{errorMessage}</p>
  </div>
{/if}

{#if pageCount > 0}
  <div class="page-counter">{pagesRendered} / {pageCount}</div>
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
    padding: 32px 20px;
    text-align: center;
    color: #e8e8e8;
    font-family: system-ui, -apple-system, Arial, sans-serif;
    font-size: 15px;
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
