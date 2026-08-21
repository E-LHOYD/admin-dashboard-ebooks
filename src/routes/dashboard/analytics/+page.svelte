<script>
  import { auth, db } from '$lib/firebase';
  import { collection, collectionGroup, getDocs } from 'firebase/firestore';
  import { signOut } from 'firebase/auth';
  import { goto } from '$app/navigation';
  import {
    latestActivityByUser,
    countActiveSince,
    minutesAgo,
    toDate,
    ACTIVE_NOW_MINUTES
  } from '$lib/activity';
  import { bookSubjects } from '$lib/subjects';
  import { hasRole, normalizeStudentType } from '$lib/users';

  let loading = $state(true);
  let errorMessage = $state('');

  // Raw collections
  let users = $state([]);
  let books = $state([]);
  let progress = $state([]);
  let customShelves = $state([]);

  const DAYS = 14;

  async function loadAll() {
    loading = true;
    errorMessage = '';
    try {
      const [userSnap, bookSnap, progressSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'books')),
        getDocs(collection(db, 'readingProgress'))
      ]);

      users = userSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      books = bookSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      progress = progressSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Shelves live at shelves/{userId}/userShelves/{shelfId}, so they can only
      // be read across all users with a collection group query.
      try {
        const shelfSnap = await getDocs(collectionGroup(db, 'userShelves'));
        customShelves = shelfSnap.docs
          .map((d) => d.data())
          .filter((s) => !s.isReadShelf && !s.isViewedShelf);
      } catch (shelfError) {
        // A collection group query can need its own index; the rest of the page
        // is still worth showing if this one part fails.
        console.error('Could not read shelves:', shelfError);
        customShelves = [];
      }
    } catch (error) {
      console.error('Analytics load failed:', error);
      errorMessage = 'Could not load analytics: ' + error.message;
    } finally {
      loading = false;
    }
  }

  loadAll();

  // ---------- helpers ----------
  const asDate = toDate;
  const dayKey = (d) => (d ? d.toISOString().slice(0, 10) : null);
  const pct = (n) => `${Math.round(n)}%`;

  function tally(items, keyFn) {
    const map = new Map();
    for (const item of items) {
      const key = keyFn(item);
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }

  // ---------- headline figures ----------
  let booksById = $derived(new Map(books.map((b) => [b.id, b])));
  let readRecords = $derived(progress.filter((p) => p.status === 'read'));
  let viewedRecords = $derived(progress.filter((p) => p.status === 'viewed'));

  let averagePercent = $derived.by(() => {
    const values = progress.map((p) => p.percentage).filter((v) => typeof v === 'number');
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  });

  let shelvedBookCount = $derived(
    customShelves.reduce((total, shelf) => total + (shelf.bookIds?.length || 0), 0)
  );

  let latestActivity = $derived(latestActivityByUser(users, progress));
  let activeNow = $derived(countActiveSince(latestActivity, minutesAgo(ACTIVE_NOW_MINUTES)));

  // Matched through the normaliser rather than on the literal string. Accounts
  // created from the dashboard stored role as 'Student' and this counted zero
  // of them, so a school registering its students here saw no students at all.
  let students = $derived(users.filter((u) => hasRole(u, 'student')));
  let teachers = $derived(users.filter((u) => hasRole(u, 'teacher')));

  // ---------- active readers per day ----------
  let activeByDay = $derived.by(() => {
    const buckets = new Map();
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      buckets.set(dayKey(d), new Set());
    }
    const record = (userId, date) => {
      const key = dayKey(date);
      if (key && buckets.has(key) && userId) buckets.get(key).add(userId);
    };
    for (const p of progress) record(p.userId, asDate(p.lastReadAt));
    for (const u of users) record(u.id, asDate(u.lastSeenAt));
    return [...buckets.entries()].map(([day, set]) => ({ day, count: set.size }));
  });

  let peakActive = $derived(Math.max(1, ...activeByDay.map((d) => d.count)));

  // ---------- subjects ----------
  const SUBJECTS_PREVIEW = 5;
  let showAllSubjects = $state(false);
  let showSubjectsModal = $state(false);

  let allSubjectRows = $derived.by(() => {
    const map = new Map();
    for (const p of progress) {
      // A book can carry several subjects, and counts once under each.
      const subjects = bookSubjects(booksById.get(p.bookId));
      for (const subject of subjects) {
        if (!map.has(subject)) map.set(subject, { label: subject, read: 0, viewed: 0 });
        if (p.status === 'read') map.get(subject).read++;
        else map.get(subject).viewed++;
      }
    }
    return [...map.values()]
      .map((r) => ({ ...r, total: r.read + r.viewed }))
      .sort((a, b) => b.total - a.total);
  });

  // The chart leads with the busiest five so the shape is readable at a glance;
  // the rest are one click away rather than dropped.
  let subjectRows = $derived(
    showAllSubjects ? allSubjectRows : allSubjectRows.slice(0, SUBJECTS_PREVIEW)
  );

  let hiddenSubjectCount = $derived(Math.max(0, allSubjectRows.length - SUBJECTS_PREVIEW));

  // Scaled against every subject, so bars keep their width when the list opens.
  let subjectMax = $derived(Math.max(1, ...allSubjectRows.map((r) => r.total)));

  // ---------- interests ----------
  // Chosen at signup, three per student, and stored on the user document.
  //
  // Deliberately counted as written rather than mapped onto the library's
  // subject list: the two are different sets. Signup offers Biology, Physics,
  // Mathematics, Computer Science, Technology, History and Culinary Arts, none
  // of which a book can carry, and the library has Math, Computer and English,
  // which no student can pick. Rewriting one into the other here would hide
  // that; the mismatch is reported underneath the chart instead.
  let librarySubjects = $derived(new Set(books.flatMap((b) => bookSubjects(b))));

  let interestRows = $derived.by(() => {
    const map = new Map();

    for (const user of users) {
      if (!Array.isArray(user.interests)) continue;

      // A student choosing the same interest twice should still count once.
      const seen = new Set();

      for (const raw of user.interests) {
        if (typeof raw !== 'string' || !raw.trim()) continue;
        const label = raw.trim();
        if (seen.has(label)) continue;
        seen.add(label);
        map.set(label, (map.get(label) || 0) + 1);
      }
    }

    return [...map.entries()]
      .map(([label, count]) => ({ label, count, inLibrary: librarySubjects.has(label) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  });

  let interestMax = $derived(Math.max(1, ...interestRows.map((r) => r.count)));

  let accountsWithInterests = $derived(
    users.filter((u) => Array.isArray(u.interests) && u.interests.length > 0).length
  );

  let unmatchedInterests = $derived(interestRows.filter((r) => !r.inLibrary));

  // ---------- most opened books ----------
  let topBooks = $derived.by(() => {
    const map = new Map();
    for (const p of progress) {
      const title = booksById.get(p.bookId)?.title || 'Removed book';
      map.set(title, (map.get(title) || 0) + 1);
    }
    return [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  });

  let topBookMax = $derived(Math.max(1, ...topBooks.map((b) => b.count)));

  // ---------- academic breakdown ----------
  let strands = $derived(
    tally(students.filter((s) => normalizeStudentType(s) === 'senior-high'), (s) => s.strand)
  );
  let courses = $derived(
    tally(students.filter((s) => normalizeStudentType(s) === 'college'), (s) => s.course)
  );
  let levels = $derived(tally(students, (s) => (s.grade ? `Grade ${s.grade}` : s.year ? `Year ${s.year}` : null)));

  // ---------- things worth acting on ----------
  let booksWithoutFile = $derived(books.filter((b) => !b.fileUrl));
  let openedBookIds = $derived(new Set(progress.map((p) => p.bookId)));
  let neverOpened = $derived(books.filter((b) => !openedBookIds.has(b.id)));

  async function logout() {
    try {
      await signOut(auth);
      goto('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  }
</script>

<div class="analytics-container viz-root">
  <header class="page-header">
    <div class="header-content">
      <h1>Analytics</h1>
      <nav class="breadcrumb"><a href="/dashboard">Dashboard</a> / Analytics</nav>
    </div>
    <div class="header-actions">
      <button class="dashboard-btn" onclick={() => goto('/dashboard')}>Return to Dashboard</button>
      <button class="logout-btn" onclick={logout}>Logout</button>
    </div>
  </header>

  {#if errorMessage}
    <div class="banner error">{errorMessage}</div>
  {/if}

  {#if loading}
    <div class="loading">Loading analytics…</div>
  {:else}
    <!-- Headline figures -->
    <section class="section">
      <h2>At a glance</h2>
      <div class="kpi-row">
        <div class="kpi"><div class="kpi-value">{readRecords.length}</div><div class="kpi-label">Books read</div></div>
        <div class="kpi"><div class="kpi-value">{viewedRecords.length}</div><div class="kpi-label">Books viewed</div></div>
        <div class="kpi"><div class="kpi-value">{pct(averagePercent)}</div><div class="kpi-label">Average progress</div></div>
        <div class="kpi"><div class="kpi-value">{shelvedBookCount}</div><div class="kpi-label">Books in created shelves</div></div>
        <div class="kpi"><div class="kpi-value">{activeNow}</div><div class="kpi-label">Active users (last {ACTIVE_NOW_MINUTES} min)</div></div>
        <div class="kpi"><div class="kpi-value">{interestRows.length}</div><div class="kpi-label">Subjects chosen as interests</div></div>
        <div class="kpi"><div class="kpi-value">{students.length}</div><div class="kpi-label">Students</div></div>
        <div class="kpi"><div class="kpi-value">{teachers.length}</div><div class="kpi-label">Teachers</div></div>
      </div>
      <p class="note">
        Read and viewed are counted per book per reader. A book counts as read once a
        reader passes 10% of it, and as viewed below that.
      </p>
    </section>

    <!-- Active readers -->
    <section class="section">
      <h2>Active readers per day</h2>
      {#if activeByDay.every((d) => d.count === 0)}
        <p class="empty">No reading activity recorded in the last {DAYS} days.</p>
      {:else}
        <div class="chart">
          <svg viewBox="0 0 720 200" role="img" aria-label="Active readers per day over the last {DAYS} days">
            {#each [0, 0.5, 1] as g}
              <line class="grid" x1="40" x2="710" y1={20 + g * 140} y2={20 + g * 140} />
              <text class="axis" x="32" y={24 + g * 140} text-anchor="end">{Math.round(peakActive * (1 - g))}</text>
            {/each}
            <polyline
              class="line"
              points={activeByDay
                .map((d, i) => `${40 + (i * 670) / Math.max(1, activeByDay.length - 1)},${160 - (d.count / peakActive) * 140}`)
                .join(' ')}
            />
            {#each activeByDay as d, i}
              <circle
                class="dot"
                cx={40 + (i * 670) / Math.max(1, activeByDay.length - 1)}
                cy={160 - (d.count / peakActive) * 140}
                r="4"
              ><title>{d.day}: {d.count} reader{d.count === 1 ? '' : 's'}</title></circle>
            {/each}
            <text class="axis" x="40" y="185">{activeByDay[0]?.day.slice(5)}</text>
            <text class="axis" x="710" y="185" text-anchor="end">{activeByDay.at(-1)?.day.slice(5)}</text>
          </svg>
        </div>
        <p class="note">
          Counted from when the app was last opened, or when reading progress was
          last saved for anyone who read before the app began recording that.
        </p>
      {/if}
    </section>

    <!-- Subjects -->
    <section class="section">
      <h2>Subjects read and viewed</h2>
      {#if subjectRows.length === 0}
        <p class="empty">No reading activity yet.</p>
      {:else}
        <div class="legend">
          <span class="key"><i class="swatch s1"></i>Read</span>
          <span class="key"><i class="swatch s2"></i>Viewed</span>
        </div>
        <div class="bars">
          {#each subjectRows as row}
            <div class="bar-row">
              <div class="bar-label" title={row.label}>{row.label}</div>
              <div class="bar-track">
                {#if row.read}
                  <div class="seg s1" style="width:{(row.read / subjectMax) * 100}%" title="{row.read} read"></div>
                {/if}
                {#if row.viewed}
                  <div class="seg s2" style="width:{(row.viewed / subjectMax) * 100}%" title="{row.viewed} viewed"></div>
                {/if}
              </div>
              <div class="bar-value">{row.read} / {row.viewed}</div>
            </div>
          {/each}
        </div>
        {#if hiddenSubjectCount > 0}
          <button class="more-btn" onclick={() => (showSubjectsModal = true)}>
            Show all
          </button>
        {/if}
      {/if}
    </section>

    <!-- Interests -->
    <section class="section">
      <h2>Subjects chosen as interests</h2>
      {#if interestRows.length === 0}
        <p class="empty">No account has chosen interests yet.</p>
      {:else}
        <div class="bars">
          {#each interestRows as row}
            <div class="bar-row">
              <div class="bar-label" title={row.label}>{row.label}</div>
              <div class="bar-track">
                <div
                  class="seg seq"
                  style="width:{(row.count / interestMax) * 100}%"
                  title="{row.count} chose {row.label}"
                ></div>
              </div>
              <div class="bar-value">{row.count}</div>
            </div>
          {/each}
        </div>
        <p class="note">
          Chosen at signup, three per account. {accountsWithInterests} of {users.length}
          accounts have them set.
        </p>
        {#if unmatchedInterests.length > 0}
          <p class="note">
            No book in the library carries {unmatchedInterests.map((r) => r.label).join(', ')}.
            The signup interest list and the library's subject list are different sets, so
            these choices cannot be matched to a book.
          </p>
        {/if}
      {/if}
    </section>

    <!-- Most opened -->
    <section class="section">
      <h2>Most opened books</h2>
      {#if topBooks.length === 0}
        <p class="empty">No books have been opened yet.</p>
      {:else}
        <div class="bars">
          {#each topBooks as row}
            <div class="bar-row">
              <div class="bar-label" title={row.label}>{row.label}</div>
              <div class="bar-track">
                <div class="seg seq" style="width:{(row.count / topBookMax) * 100}%"></div>
              </div>
              <div class="bar-value">{row.count}</div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Academic breakdown -->
    <section class="section">
      <h2>Student academic details</h2>
      <div class="split">
        {#each [{ title: 'Senior high strands', rows: strands }, { title: 'College courses', rows: courses }, { title: 'Grade and year levels', rows: levels }] as group}
          <div class="split-col">
            <h3>{group.title}</h3>
            {#if group.rows.length === 0}
              <p class="empty">None recorded.</p>
            {:else}
              <div class="bars compact">
                {#each group.rows as row}
                  <div class="bar-row">
                    <div class="bar-label" title={row.label}>{row.label}</div>
                    <div class="bar-track">
                      <div
                        class="seg seq"
                        style="width:{(row.count / Math.max(1, ...group.rows.map((r) => r.count))) * 100}%"
                      ></div>
                    </div>
                    <div class="bar-value">{row.count}</div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <!-- Actionable -->
    <section class="section">
      <h2>Needs attention</h2>
      <div class="kpi-row">
        <div class="kpi warn">
          <div class="kpi-value">{booksWithoutFile.length}</div>
          <div class="kpi-label">Books with no file — unreadable in the app</div>
        </div>
        <div class="kpi">
          <div class="kpi-value">{neverOpened.length}</div>
          <div class="kpi-label">Books nobody has opened</div>
        </div>
        <div class="kpi">
          <div class="kpi-value">{books.length}</div>
          <div class="kpi-label">Books in the library</div>
        </div>
      </div>
      {#if booksWithoutFile.length > 0}
        <ul class="mini-list">
          {#each booksWithoutFile.slice(0, 6) as book}
            <li>{book.title}</li>
          {/each}
          {#if booksWithoutFile.length > 6}<li class="muted">and {booksWithoutFile.length - 6} more</li>{/if}
        </ul>
      {/if}
    </section>

    <section class="section">
      <h2>Tables</h2>
      <div class="split">
        <div class="split-col">
          <h3>Subjects</h3>
          <table class="data-table">
            <thead><tr><th>Subject</th><th>Read</th><th>Viewed</th></tr></thead>
            <tbody>
              {#each allSubjectRows as r}<tr><td>{r.label}</td><td>{r.read}</td><td>{r.viewed}</td></tr>{/each}
            </tbody>
          </table>
        </div>
        <div class="split-col">
          <h3>Interests</h3>
          <table class="data-table">
            <thead><tr><th>Subject</th><th>Chosen by</th><th>In library</th></tr></thead>
            <tbody>
              {#each interestRows as r}
                <tr><td>{r.label}</td><td>{r.count}</td><td>{r.inLibrary ? 'Yes' : 'No'}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="split-col">
          <h3>Active readers</h3>
          <table class="data-table">
            <thead><tr><th>Day</th><th>Readers</th></tr></thead>
            <tbody>
              {#each activeByDay as d}<tr><td>{d.day}</td><td>{d.count}</td></tr>{/each}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  {/if}

  <!-- Subjects Modal -->
  {#if showSubjectsModal}
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="subjects-modal-title" onclick={(e) => { if (e.target === e.currentTarget) showSubjectsModal = false; }}>
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="subjects-modal-title">All Subjects ({allSubjectRows.filter(r => r.label !== 'Unspecified').length})</h3>
          <button class="close-btn" onclick={() => showSubjectsModal = false} aria-label="Close modal">&times;</button>
        </div>
        <div class="legend">
          <span class="key"><i class="swatch s1"></i>Read</span>
          <span class="key"><i class="swatch s2"></i>Viewed</span>
        </div>
        <div class="bars">
          {#each allSubjectRows.filter(r => r.label !== 'Unspecified') as row}
            <div class="bar-row">
              <div class="bar-label" title={row.label}>{row.label}</div>
              <div class="bar-track">
                {#if row.read}
                  <div class="seg s1" style="width:{(row.read / subjectMax) * 100}%" title="{row.read} read"></div>
                {/if}
                {#if row.viewed}
                  <div class="seg s2" style="width:{(row.viewed / subjectMax) * 100}%" title="{row.viewed} viewed"></div>
                {/if}
              </div>
              <div class="bar-value">{row.read} / {row.viewed}</div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  @import '../style.css';

  /* Palette roles, in one place so a colour is changed once.
   *
   * There is deliberately no dark variant. Every surface on this page and in
   * the rest of the dashboard is hardcoded white: the cards, the chart panels,
   * the tables. A dark palette used to be applied whenever the operating system
   * asked for dark mode, which painted white text on those white cards, so the
   * figures vanished and the labels turned pale grey. The page is light, and
   * says so, whatever the system preference is. */
  .viz-root {
    color-scheme: light only;
    --surface-1: #fcfcfb;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --text-muted: #6f6e6a;
    --grid: #d8d7d2;
    --series-1: #2a78d6;
    --series-2: #eb6834;
    --sequential: #2a78d6;
    --critical: #d03b3b;
    /* series-1 is tuned for filled bars; as small text on white it only
       reaches 4.4:1, so buttons use a darker step of the same blue. */
    --series-1-text: #1a5fb4;

    /* Anything without a colour rule of its own, table cells especially,
       inherits a readable one rather than whatever the browser picks. */
    color: var(--text-primary);
  }

  .more-btn {
    margin-top: 14px;
    background: none;
    color: var(--series-1-text);
    border: 1px solid var(--grid);
    padding: 8px 14px;
    border-radius: 5px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .more-btn:hover {
    background: var(--surface-1);
  }

  .banner.error {
    background: #fdecea;
    color: #b3261e;
    border: 1px solid #f5c2c0;
    border-radius: 5px;
    padding: 12px 16px;
    margin-bottom: 16px;
  }

  .dashboard-btn {
    background: white;
    color: var(--brand);
    border: 2px solid var(--brand);
    padding: 10px 20px;
    border-radius: var(--radius);
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: bold;
  }

  .dashboard-btn:hover {
    background: var(--brand);
    color: white;
  }

  .section { margin-bottom: 40px; }
  .section h2 { color: var(--text-heading); font-size: 1rem; font-weight: bold; margin-bottom: 20px; }
  .section h3 { color: var(--text-heading); font-size: 0.9rem; font-weight: bold; margin: 0 0 10px 0; }

  .note { margin-top: 10px; font-size: 13px; color: var(--text-muted); line-height: 1.5; }
  .empty { color: var(--text-muted); font-size: 14px; }

  .kpi-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 16px;
  }

  .kpi {
    background: white;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px;
    box-shadow: var(--shadow);
  }

  .kpi-value { font-size: 30px; font-weight: 700; color: var(--text-primary); line-height: 1.1; }
  .kpi-label { margin-top: 6px; font-size: 13px; color: var(--text-secondary); }
  .kpi.warn .kpi-value { color: var(--critical); }

  .chart { background: white; border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; box-shadow: var(--shadow); }
  .chart svg { width: 100%; height: auto; display: block; }

  .grid { stroke: var(--grid); stroke-width: 1; }
  .axis { fill: var(--text-muted); font-size: 11px; }
  .line { fill: none; stroke: var(--sequential); stroke-width: 2; stroke-linejoin: round; }
  .dot { fill: var(--sequential); stroke: var(--surface-1); stroke-width: 2; }

  .legend { display: flex; gap: 16px; margin-bottom: 12px; font-size: 13px; color: var(--text-secondary); }
  .key { display: inline-flex; align-items: center; gap: 6px; }
  .swatch { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
  .swatch.s1 { background: var(--series-1); }
  .swatch.s2 { background: var(--series-2); }

  .bars { display: flex; flex-direction: column; gap: 10px; }
  .bars.compact { gap: 7px; }

  .bar-row { display: grid; grid-template-columns: 150px 1fr auto; gap: 12px; align-items: center; }

  .bar-label {
    font-size: 13px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-track { display: flex; gap: 2px; height: 14px; }

  .seg { border-radius: 0 4px 4px 0; min-width: 2px; transition: opacity 0.15s ease; }
  .seg:first-child { border-radius: 4px; }
  .seg:hover { opacity: 0.75; }
  .seg.s1 { background: var(--series-1); }
  .seg.s2 { background: var(--series-2); }
  .seg.seq { background: var(--sequential); }

  .bar-value { font-size: 13px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }

  .split { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; }
  .split-col { background: white; border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); }

  .mini-list { margin: 12px 0 0 0; padding-left: 18px; font-size: 13px; color: var(--text-secondary); }
  .mini-list .muted { color: var(--text-muted); list-style: none; margin-left: -18px; }

  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th, .data-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border-soft); }
  .data-table th { color: var(--text-secondary); font-weight: 600; }
  .data-table td { color: var(--text-primary); }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    padding: 20px;
  }

  .modal-content {
    background: white;
    padding: 30px;
    border-radius: var(--radius);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    max-width: 700px;
    width: 100%;
    max-height: 85vh;
    overflow-y: auto;
  }

  .modal-content .bars {
    max-height: 60vh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .modal-header h3 {
    margin: 0;
    color: var(--text-heading);
    font-size: 1.1rem;
    font-weight: bold;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #666;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: #f8f9fa;
    color: #333;
  }

  .close-btn:focus {
    outline: 2px solid #007bff;
    outline-offset: 2px;
  }

  @media (max-width: 640px) {
    .bar-row { grid-template-columns: 110px 1fr auto; }
  }
</style>
