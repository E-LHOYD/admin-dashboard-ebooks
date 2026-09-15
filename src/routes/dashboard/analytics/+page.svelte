<script>
  import Logo from '$lib/components/Logo.svelte';
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
  import { bookSubjects, DEFAULT_SUBJECTS } from '$lib/subjects';
  import { hasRole, normalizeStudentType, DEPARTMENTS } from '$lib/users';
  import { normalizeLevel } from '$lib/yearLevels';

  let loading = $state(true);
  let errorMessage = $state('');

  // Raw collections
  let users = $state([]);
  let books = $state([]);
  let progress = $state([]);
  let customShelves = $state([]);

  // The lists the dashboard manages, so a program, department or subject with
  // nobody (or no book) in it still shows as a zero rather than disappearing.
  let programs = $state([]);
  let departmentNames = $state([]);
  let subjectNames = $state([]);

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

      // Each of these only adds zero rows to a chart, so one failing to load is
      // no reason to lose the page: the counts still come from users and books.
      const [programSnap, departmentSnap, subjectSnap] = await Promise.allSettled([
        getDocs(collection(db, 'programMappings')),
        getDocs(collection(db, 'departmentMappings')),
        getDocs(collection(db, 'subjects'))
      ]);
      const docsOf = (result) => (result.status === 'fulfilled' ? result.value.docs.map((d) => d.data()) : []);
      programs = docsOf(programSnap);
      departmentNames = docsOf(departmentSnap).map((d) => d.department);
      subjectNames = docsOf(subjectSnap).map((d) => d.name);

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

  /**
   * Count items against a list of known labels, matched without regard to case
   * or stray spaces. Known labels with nothing in them stay as zero rows; a
   * value outside the list still gets its own row rather than being lost.
   * keyFn may return one label or several (a book carries several subjects).
   */
  function countAgainst(known, items, keyFn) {
    const map = new Map();
    const add = (raw) => {
      if (typeof raw !== 'string' || !raw.trim()) return null;
      const key = raw.trim().toUpperCase();
      if (!map.has(key)) map.set(key, { label: raw.trim(), count: 0 });
      return key;
    };

    for (const label of known) add(label);

    for (const item of items) {
      const value = keyFn(item);
      const keys = new Set((Array.isArray(value) ? value : [value]).map(add).filter(Boolean));
      for (const key of keys) map.get(key).count++;
    }

    return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  const hasText = (v) => typeof v === 'string' && v.trim() !== '';

  // ---------- headline figures ----------
  let booksById = $derived(new Map(books.map((b) => [b.id, b])));
  let readRecords = $derived(progress.filter((p) => p.status === 'read'));

  // ---------- reading frequency metrics ----------
  let totalReadingDuration = $derived(
    progress.reduce((total, p) => total + (p.totalDurationMinutes || 0), 0)
  );

  let totalReadingSessions = $derived(
    progress.reduce((total, p) => total + (p.sessionCount || 0), 0)
  );

  let averageSessionDuration = $derived.by(() => {
    const sessions = progress.filter((p) => p.sessionCount > 0);
    if (sessions.length === 0) return 0;
    const total = sessions.reduce((sum, p) => sum + (p.totalDurationMinutes || 0), 0);
    const count = sessions.reduce((sum, p) => sum + (p.sessionCount || 0), 0);
    return Math.round(total / count);
  });

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

  // ---------- at a glance ----------
  // Each card carries the sentence shown when it is clicked, so what a number
  // counts sits next to the number instead of in a paragraph under all of them.
  let glanceCards = $derived([
    // About Books
    {
      key: 'books',
      value: books.length,
      label: 'Books in the library',
      info: 'Every book uploaded to the library, whether or not anyone has opened it yet.'
    },
    {
      key: 'shelved',
      value: shelvedBookCount,
      label: 'Books in created shelves',
      info: "Books on the shelves readers made for themselves."
    },
    {
      key: 'read',
      value: readRecords.length,
      label: 'Books read',
      info: 'Counted per book per reader: a book counts as read once a reader gets past 10% of it. One book read by three readers counts as three.'
    },
    // Reading Sessions
    {
      key: 'sessions',
      value: totalReadingSessions,
      label: 'Reading sessions',
      info: 'How many separate times readers have sat down with a book. Each stretch of reading counts as one session.'
    },
    {
      key: 'time',
      value: `${Math.round(totalReadingDuration / 60)}h`,
      label: 'Total reading time',
      info: 'Minutes spent reading across every session by every reader, added together and shown in hours.'
    },
    {
      key: 'session-length',
      value: `${averageSessionDuration}m`,
      label: 'Avg session duration',
      info: 'Total reading time divided by the number of reading sessions, in minutes.'
    },
    {
      key: 'progress',
      value: pct(averagePercent),
      label: 'Average progress',
      info: 'How far through a book readers have got, on average, across every book each reader has opened.'
    },
    // Users
    {
      key: 'active',
      value: activeNow,
      label: `Active users (last ${ACTIVE_NOW_MINUTES} min)`,
      info: `Accounts that opened the app or saved reading progress in the last ${ACTIVE_NOW_MINUTES} minutes.`
    },
    {
      key: 'students',
      value: students.length,
      label: 'Students',
      info: 'Accounts with the student role, senior high and college together.'
    },
    {
      key: 'teachers',
      value: teachers.length,
      label: 'Teachers',
      info: 'Accounts with the teacher role.'
    },
    {
      key: 'interests',
      value: interestRows.length,
      label: 'Subjects chosen as interests',
      info: 'How many different subjects accounts have picked as interests. Each account picks three at signup.'
    }
  ]);

  let openCardKey = $state(null);
  let openCard = $derived(glanceCards.find((c) => c.key === openCardKey) ?? null);

  // ---------- active readers per day ----------
  let activeByDay = $derived.by(() => {
    const buckets = new Map();
    
    // Collect all dates from the data first
    const allDates = new Set();
    for (const p of progress) {
      const date = asDate(p.lastReadAt);
      if (date) allDates.add(dayKey(date));
    }
    for (const u of users) {
      const date = asDate(u.lastSeenAt);
      if (date) allDates.add(dayKey(date));
    }
    
    // If no data, return empty array
    if (allDates.size === 0) return [];
    
    // Find the earliest date from data
    const sortedDates = [...allDates].sort();
    const earliest = sortedDates[0];
    
    // Use today's date as the end date to include all days up to today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Create buckets for all dates in the range (including days with no activity)
    const currentDate = new Date(earliest);
    
    while (currentDate <= today) {
      buckets.set(dayKey(currentDate), new Set());
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    const record = (userId, date) => {
      const key = dayKey(date);
      if (key && buckets.has(key) && userId) buckets.get(key).add(userId);
    };
    for (const p of progress) record(p.userId, asDate(p.lastReadAt));
    for (const u of users) record(u.id, asDate(u.lastSeenAt));
    
    // Sort by date and return
    return [...buckets.entries()]
      .map(([day, set]) => ({ day, count: set.size }))
      .sort((a, b) => a.day.localeCompare(b.day));
  });

  let peakActive = $derived(Math.max(1, ...activeByDay.map((d) => d.count)));
  let showActiveReadersModal = $state(false);
  const ACTIVE_READERS_PREVIEW = 7;
  let activeReadersPreview = $derived(activeByDay.slice(-ACTIVE_READERS_PREVIEW));
  let activeReadersFilter = $state('newest'); // 'newest', 'oldest', 'most-read', 'least-read'
  
  let filteredActiveReaders = $derived.by(() => {
    const sorted = [...activeByDay];
    switch (activeReadersFilter) {
      case 'newest':
        return sorted.sort((a, b) => b.day.localeCompare(a.day));
      case 'oldest':
        return sorted.sort((a, b) => a.day.localeCompare(b.day));
      case 'most-read':
        return sorted.sort((a, b) => b.count - a.count || a.day.localeCompare(b.day));
      case 'least-read':
        return sorted.sort((a, b) => a.count - b.count || a.day.localeCompare(b.day));
      default:
        return sorted;
    }
  });

  // ---------- subjects ----------
  const SUBJECTS_PREVIEW = 5;
  let showAllSubjects = $state(false);
  let showSubjectsModal = $state(false);

  let allSubjectRows = $derived.by(() => {
    const map = new Map();
    for (const p of progress) {
      // A book can carry several subjects, and counts once under each.
      const subjects = bookSubjects(booksById.get(p.bookId));
      if (p.status !== 'read') continue;
      for (const subject of subjects) {
        if (!map.has(subject)) map.set(subject, { label: subject, read: 0 });
        map.get(subject).read++;
      }
    }
    return [...map.values()]
      .map((r) => ({ ...r, total: r.read }))
      .sort((a, b) => b.total - a.total);
  });

  // For modal: include all subjects even with zero counts
  let allSubjectsWithZeros = $derived.by(() => {
    const subjectMap = new Map();

    // Initialize all subjects with zero counts
    for (const subject of DEFAULT_SUBJECTS) {
      subjectMap.set(subject, { label: subject, read: 0 });
    }
    
    // Fill in actual counts from progress
    for (const p of progress) {
      const subjects = bookSubjects(booksById.get(p.bookId));
      for (const subject of subjects) {
        if (subjectMap.has(subject)) {
          if (p.status === 'read') subjectMap.get(subject).read++;
        }
      }
    }
    
    return [...subjectMap.values()]
      .map((r) => ({ ...r, total: r.read }))
      .filter((r) => r.label !== 'Unspecified')
      .sort((a, b) => b.total - a.total);
  });

  // The chart leads with the busiest five so the shape is readable at a glance;
  // the rest are one click away rather than dropped.
  let subjectRows = $derived(
    showAllSubjects ? allSubjectRows : allSubjectRows.slice(0, SUBJECTS_PREVIEW)
  );

  let hiddenSubjectCount = $derived(Math.max(0, allSubjectRows.length - SUBJECTS_PREVIEW));

  // Scaled against every subject, so bars keep their width when the list opens.
  let subjectMax = $derived(Math.max(1, ...allSubjectsWithZeros.map((r) => r.total)));

  // ---------- programs ----------
  // A senior high student's program is their strand, a college student's their
  // course. Anyone without a student type is placed by whichever one they have.
  let shsStudents = $derived(
    students.filter((s) => {
      const type = normalizeStudentType(s);
      return type === 'senior-high' || (!type && hasText(s.strand) && !hasText(s.course));
    })
  );
  let collegeStudents = $derived(
    students.filter((s) => {
      const type = normalizeStudentType(s);
      return type === 'college' || (!type && hasText(s.course));
    })
  );

  const programsOfType = (type) =>
    programs.filter((p) => String(p.type || '').toLowerCase() === type).map((p) => p.name);

  let programGroups = $derived([
    {
      title: 'Senior High (SHS)',
      rows: countAgainst(programsOfType('shs'), shsStudents, (s) => s.strand)
    },
    {
      title: 'College',
      rows: countAgainst(programsOfType('college'), collegeStudents, (s) => s.course)
    }
  ]);

  let programMax = $derived(Math.max(1, ...programGroups.flatMap((g) => g.rows.map((r) => r.count))));

  let studentsWithoutProgram = $derived(
    students.filter((s) => !hasText(s.strand) && !hasText(s.course)).length
  );

  // ---------- year levels ----------
  // Senior high reads as "11 SHS" / "12 SHS" and college as "1 College" and so
  // on. Whatever a student typed goes through normalizeLevel first, so "Grade
  // 11", "grade11" and "11" all land on the same row.
  const LEVEL_ORDER = ['11 SHS', '12 SHS', '1 College', '2 College', '3 College', '4 College', '5 College'];

  function yearLevelLabel(user) {
    const level = normalizeLevel(user?.grade) || normalizeLevel(user?.year) || normalizeLevel(user?.yearLevel);
    const grade = level.match(/^Grade (\d+)$/);
    if (grade) return `${grade[1]} SHS`;
    const year = level.match(/^(\d)\w* Year$/);
    if (year) return `${year[1]} College`;
    return '';
  }

  let yearLevelRows = $derived.by(() => {
    const counts = new Map(LEVEL_ORDER.map((label) => [label, 0]));
    for (const student of students) {
      const label = yearLevelLabel(student);
      if (label) counts.set(label, (counts.get(label) || 0) + 1);
    }
    // Fifth year only exists on some courses, so it is shown only when used.
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .filter((r) => r.label !== '5 College' || r.count > 0);
  });

  let yearLevelMax = $derived(Math.max(1, ...yearLevelRows.map((r) => r.count)));

  let studentsWithoutLevel = $derived(students.filter((s) => !yearLevelLabel(s)).length);

  // ---------- books per subject ----------
  let booksPerSubjectRows = $derived(
    countAgainst(subjectNames.length ? subjectNames : DEFAULT_SUBJECTS, books, (b) => bookSubjects(b))
  );
  let booksPerSubjectMax = $derived(Math.max(1, ...booksPerSubjectRows.map((r) => r.count)));
  let booksWithoutSubject = $derived(books.filter((b) => bookSubjects(b).length === 0).length);

  // ---------- teachers per department ----------
  let teachersPerDepartmentRows = $derived(
    countAgainst(departmentNames.length ? departmentNames : DEPARTMENTS, teachers, (t) => t.department)
  );
  let teachersPerDepartmentMax = $derived(
    Math.max(1, ...teachersPerDepartmentRows.map((r) => r.count))
  );
  let teachersWithoutDepartment = $derived(teachers.filter((t) => !hasText(t.department)).length);

  // ---------- activity status ----------
  let activityStatusRows = $derived.by(() => {
    const map = new Map();
    for (const user of users) {
      if (!hasRole(user, 'student') && !hasRole(user, 'teacher')) continue;
      const status = user.activityStatus || 'Active';
      map.set(status, (map.get(status) || 0) + 1);
    }
    return [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  });

  let activityStatusMax = $derived(Math.max(1, ...activityStatusRows.map((r) => r.count)));

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
  const BOOKS_PREVIEW = 8;
  let showBooksModal = $state(false);

  let allBookRows = $derived.by(() => {
    const map = new Map();
    for (const p of progress) {
      if (p.status !== 'read') continue;
      const title = booksById.get(p.bookId)?.title || 'Removed book';
      if (!map.has(title)) map.set(title, { label: title, read: 0 });
      map.get(title).read++;
    }
    return [...map.values()]
      .map((r) => ({ ...r, total: r.read }))
      .sort((a, b) => b.total - a.total);
  });

  let bookRows = $derived(allBookRows.slice(0, BOOKS_PREVIEW));
  let hiddenBookCount = $derived(Math.max(0, allBookRows.length - BOOKS_PREVIEW));
  let bookMax = $derived(Math.max(1, ...allBookRows.map((r) => r.total)));

  // ---------- things worth acting on ----------
  let openedBookIds = $derived(new Set(progress.map((p) => p.bookId)));
  let neverOpened = $derived(books.filter((b) => !openedBookIds.has(b.id)));
  let showNeverOpenedModal = $state(false);

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
      <div class="brand-line"><Logo /></div>
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
      
      <!-- About Books -->
      <h3>About Books</h3>
      <div class="kpi-row">
        {#each glanceCards.filter(c => ['books', 'shelved', 'read'].includes(c.key)) as card (card.key)}
          <button
            type="button"
            class="kpi kpi-btn"
            class:open={openCardKey === card.key}
            aria-expanded={openCardKey === card.key}
            aria-controls="glance-info"
            onclick={() => (openCardKey = openCardKey === card.key ? null : card.key)}
          >
            <div class="kpi-value">{card.value}</div>
            <div class="kpi-label">{card.label}</div>
          </button>
        {/each}
      </div>
      
      <!-- Reading Sessions -->
      <h3>Reading Sessions</h3>
      <div class="kpi-row">
        {#each glanceCards.filter(c => ['sessions', 'time', 'session-length', 'progress'].includes(c.key)) as card (card.key)}
          <button
            type="button"
            class="kpi kpi-btn"
            class:open={openCardKey === card.key}
            aria-expanded={openCardKey === card.key}
            aria-controls="glance-info"
            onclick={() => (openCardKey = openCardKey === card.key ? null : card.key)}
          >
            <div class="kpi-value">{card.value}</div>
            <div class="kpi-label">{card.label}</div>
          </button>
        {/each}
      </div>
      
      <!-- Users -->
      <h3>Users</h3>
      <div class="kpi-row">
        {#each glanceCards.filter(c => ['active', 'students', 'teachers', 'interests'].includes(c.key)) as card (card.key)}
          <button
            type="button"
            class="kpi kpi-btn"
            class:open={openCardKey === card.key}
            aria-expanded={openCardKey === card.key}
            aria-controls="glance-info"
            onclick={() => (openCardKey = openCardKey === card.key ? null : card.key)}
          >
            <div class="kpi-value">{card.value}</div>
            <div class="kpi-label">{card.label}</div>
          </button>
        {/each}
      </div>
      
      {#if openCard}
        <div class="kpi-info" id="glance-info" role="region" aria-live="polite">
          <div>
            <strong>{openCard.label}</strong>
            <p>{openCard.info}</p>
          </div>
          <button type="button" class="info-close" onclick={() => (openCardKey = null)} aria-label="Close explanation">&times;</button>
        </div>
      {:else}
        <p class="note">Click a card to see what it counts.</p>
      {/if}
    </section>

    <!-- Active readers -->
    <section class="section">
      <h2>Active readers per day</h2>
      {#if activeByDay.every((d) => d.count === 0)}
        <p class="empty">No reading activity recorded.</p>
      {:else}
        <div class="chart">
          <svg viewBox="0 0 720 200" role="img" aria-label="Active readers per day over time">
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
      <h2>Subjects read</h2>
      {#if subjectRows.length === 0}
        <p class="empty">No reading activity yet.</p>
      {:else}
        <div class="bars">
          {#each subjectRows as row}
            <div class="bar-row">
              <div class="bar-label" title={row.label}>{row.label}</div>
              <div class="bar-track">
                {#if row.read}
                  <div class="seg s1" style="width:{(row.read / subjectMax) * 100}%" title="{row.read} read"></div>
                {/if}
              </div>
              <div class="bar-value">{row.read}</div>
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

    <!-- Books per subject -->
    <section class="section">
      <h2>Books per subject</h2>
      {#if books.length === 0}
        <p class="empty">No books in the library yet.</p>
      {:else}
        <div class="bars">
          {#each booksPerSubjectRows as row}
            <div class="bar-row">
              <div class="bar-label" title={row.label}>{row.label}</div>
              <div class="bar-track">
                {#if row.count}
                  <div
                    class="seg seq"
                    style="width:{(row.count / booksPerSubjectMax) * 100}%"
                    title="{row.count} book{row.count === 1 ? '' : 's'}"
                  ></div>
                {/if}
              </div>
              <div class="bar-value">{row.count}</div>
            </div>
          {/each}
        </div>
        <p class="note">
          A book with several subjects counts once under each.
          {#if booksWithoutSubject > 0}
            {booksWithoutSubject} book{booksWithoutSubject === 1 ? ' has' : 's have'} no subject set.
          {/if}
        </p>
      {/if}
    </section>

    <!-- Programs -->
    <section class="section">
      <h2>Students by program</h2>
      {#if students.length === 0}
        <p class="empty">No students yet.</p>
      {:else}
        <div class="split">
          {#each programGroups as group}
            <div class="split-col">
              <h3>{group.title}</h3>
              {#if group.rows.length === 0}
                <p class="empty">No programs recorded.</p>
              {:else}
                <div class="bars compact">
                  {#each group.rows as row}
                    <div class="bar-row">
                      <div class="bar-label" title={row.label}>{row.label}</div>
                      <div class="bar-track">
                        {#if row.count}
                          <div
                            class="seg seq"
                            style="width:{(row.count / programMax) * 100}%"
                            title="{row.count} student{row.count === 1 ? '' : 's'}"
                          ></div>
                        {/if}
                      </div>
                      <div class="bar-value">{row.count}</div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
        <p class="note">
          Senior high students are counted by strand, college students by course.
          {#if studentsWithoutProgram > 0}
            {studentsWithoutProgram} student{studentsWithoutProgram === 1 ? ' has' : 's have'} no program set.
          {/if}
        </p>
      {/if}
    </section>

    <!-- Year Levels -->
    <section class="section">
      <h2>Students by year level</h2>
      {#if students.length === 0}
        <p class="empty">No students yet.</p>
      {:else}
        <div class="bars">
          {#each yearLevelRows as row}
            <div class="bar-row">
              <div class="bar-label" title={row.label}>{row.label}</div>
              <div class="bar-track">
                {#if row.count}
                  <div
                    class="seg seq"
                    style="width:{(row.count / yearLevelMax) * 100}%"
                    title="{row.count} student{row.count === 1 ? '' : 's'}"
                  ></div>
                {/if}
              </div>
              <div class="bar-value">{row.count}</div>
            </div>
          {/each}
        </div>
        {#if studentsWithoutLevel > 0}
          <p class="note">
            {studentsWithoutLevel} student{studentsWithoutLevel === 1 ? ' has' : 's have'} no year level that could be read.
          </p>
        {/if}
      {/if}
    </section>

    <!-- Teachers per department -->
    <section class="section">
      <h2>Teachers per department</h2>
      {#if teachers.length === 0}
        <p class="empty">No teachers yet.</p>
      {:else}
        <div class="bars">
          {#each teachersPerDepartmentRows as row}
            <div class="bar-row">
              <div class="bar-label" title={row.label}>{row.label}</div>
              <div class="bar-track">
                {#if row.count}
                  <div
                    class="seg seq"
                    style="width:{(row.count / teachersPerDepartmentMax) * 100}%"
                    title="{row.count} teacher{row.count === 1 ? '' : 's'}"
                  ></div>
                {/if}
              </div>
              <div class="bar-value">{row.count}</div>
            </div>
          {/each}
        </div>
        {#if teachersWithoutDepartment > 0}
          <p class="note">
            {teachersWithoutDepartment} teacher{teachersWithoutDepartment === 1 ? ' has' : 's have'} no department set.
          </p>
        {/if}
      {/if}
    </section>

    <!-- Activity Status -->
    <section class="section">
      <h2>Users by Activity Status</h2>
      {#if activityStatusRows.length === 0}
        <p class="empty">No user activity status data available.</p>
      {:else}
        <div class="bars">
          {#each activityStatusRows as row}
            <div class="bar-row">
              <div class="bar-label" title={row.label}>{row.label}</div>
              <div class="bar-track">
                <div
                  class="seg seq"
                  style="width:{(row.count / activityStatusMax) * 100}%"
                  title="{row.count} users"
                ></div>
              </div>
              <div class="bar-value">{row.count}</div>
            </div>
          {/each}
        </div>
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
      <h2>Most books read</h2>
      {#if allBookRows.length === 0}
        <p class="empty">No books have been read yet.</p>
      {:else}
        <div class="bars">
          {#each bookRows as row}
            <div class="bar-row">
              <div class="bar-label" title={row.label}>{row.label}</div>
              <div class="bar-track">
                {#if row.read}
                  <div class="seg s1" style="width:{(row.read / bookMax) * 100}%" title="{row.read} read"></div>
                {/if}
              </div>
              <div class="bar-value">{row.read}</div>
            </div>
          {/each}
        </div>
        {#if hiddenBookCount > 0}
          <button class="more-btn" onclick={() => (showBooksModal = true)}>
            Show all
          </button>
        {/if}
      {/if}
    </section>

    <!-- Actionable -->
    <section class="section">
      <h2>Needs attention</h2>
      <div class="kpi-row">
        <div class="kpi clickable" onclick={() => showNeverOpenedModal = true}>
          <div class="kpi-value">{neverOpened.length}</div>
          <div class="kpi-label">Books nobody has opened</div>
        </div>
        <div class="kpi clickable" onclick={() => goto('/dashboard/books')}>
          <div class="kpi-value">{books.length}</div>
          <div class="kpi-label">Books in the library</div>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Tables</h2>
      <div class="split">
        <div class="split-col">
          <h3>Subjects</h3>
          <table class="data-table">
            <thead><tr><th>Subject</th><th>Read</th></tr></thead>
            <tbody>
              {#each allSubjectRows as r}<tr><td>{r.label}</td><td>{r.read}</td></tr>{/each}
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
              {#each activeReadersPreview as d}<tr><td>{d.day}</td><td>{d.count}</td></tr>{/each}
            </tbody>
          </table>
          {#if activeByDay.length > ACTIVE_READERS_PREVIEW}
            <button class="more-btn" onclick={() => showActiveReadersModal = true}>
              View all ({activeByDay.length} days)
            </button>
          {/if}
        </div>
      </div>
    </section>
  {/if}

  <!-- Subjects Modal -->
  {#if showSubjectsModal}
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="subjects-modal-title" onclick={(e) => { if (e.target === e.currentTarget) showSubjectsModal = false; }}>
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="subjects-modal-title">All Subjects ({allSubjectsWithZeros.length})</h3>
          <button class="close-btn" onclick={() => showSubjectsModal = false} aria-label="Close modal">&times;</button>
        </div>
        <div class="bars">
          {#each allSubjectsWithZeros as row}
            <div class="bar-row">
              <div class="bar-label" title={row.label}>{row.label}</div>
              <div class="bar-track">
                {#if row.read}
                  <div class="seg s1" style="width:{(row.read / subjectMax) * 100}%" title="{row.read} read"></div>
                {/if}
              </div>
              <div class="bar-value">{row.read}</div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Books Modal -->
  {#if showBooksModal}
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="books-modal-title" onclick={(e) => { if (e.target === e.currentTarget) showBooksModal = false; }}>
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="books-modal-title">All Books ({allBookRows.length})</h3>
          <button class="close-btn" onclick={() => showBooksModal = false} aria-label="Close modal">&times;</button>
        </div>
        <div class="bars">
          {#each allBookRows as row}
            <div class="bar-row">
              <div class="bar-label" title={row.label}>{row.label}</div>
              <div class="bar-track">
                {#if row.read}
                  <div class="seg s1" style="width:{(row.read / bookMax) * 100}%" title="{row.read} read"></div>
                {/if}
              </div>
              <div class="bar-value">{row.read}</div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Never Opened Books Modal -->
  {#if showNeverOpenedModal}
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="never-opened-modal-title" onclick={(e) => { if (e.target === e.currentTarget) showNeverOpenedModal = false; }}>
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="never-opened-modal-title">Books Nobody Has Opened ({neverOpened.length})</h3>
          <button class="close-btn" onclick={() => showNeverOpenedModal = false} aria-label="Close modal">&times;</button>
        </div>
        <div class="modal-table">
          <table class="data-table">
            <thead><tr><th>Title</th><th>Author</th><th>Subject</th></tr></thead>
            <tbody>
              {#each neverOpened as book}
                <tr>
                  <td>{book.title}</td>
                  <td>{book.author}</td>
                  <td>{book.subjects ? book.subjects.join(', ') : '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  {/if}

  <!-- Active Readers Modal -->
  {#if showActiveReadersModal}
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="active-readers-modal-title" onclick={(e) => { if (e.target === e.currentTarget) showActiveReadersModal = false; }}>
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="active-readers-modal-title">Active Readers Per Day ({activeByDay.length} days)</h3>
          <button class="close-btn" onclick={() => showActiveReadersModal = false} aria-label="Close modal">&times;</button>
        </div>
        <div class="modal-filters">
          <button class="filter-btn" class:active={activeReadersFilter === 'newest'} onclick={() => activeReadersFilter = 'newest'}>Newest</button>
          <button class="filter-btn" class:active={activeReadersFilter === 'oldest'} onclick={() => activeReadersFilter = 'oldest'}>Oldest</button>
          <button class="filter-btn" class:active={activeReadersFilter === 'most-read'} onclick={() => activeReadersFilter = 'most-read'}>Most Read</button>
          <button class="filter-btn" class:active={activeReadersFilter === 'least-read'} onclick={() => activeReadersFilter = 'least-read'}>Least Read</button>
        </div>
        <div class="modal-table">
          <table class="data-table">
            <thead><tr><th>Day</th><th>Readers</th></tr></thead>
            <tbody>
              {#each filteredActiveReaders as d}
                <tr>
                  <td>{d.day}</td>
                  <td>{d.count}</td>
                </tr>
              {/each}
            </tbody>
          </table>
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

  .modal-filters {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .filter-btn {
    background: none;
    color: var(--text-secondary);
    border: 1px solid var(--grid);
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .filter-btn:hover {
    background: var(--surface-1);
    color: var(--text-primary);
  }

  .filter-btn.active {
    background: var(--series-1);
    color: white;
    border-color: var(--series-1);
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
  .section h3 { color: var(--text-heading); font-size: 0.9rem; font-weight: bold; margin: 20px 0 10px 0; }

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

  .kpi-btn {
    font: inherit;
    text-align: left;
    width: 100%;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .kpi-btn:hover { border-color: var(--sequential); }
  .kpi-btn:focus-visible { outline: 2px solid var(--sequential); outline-offset: 2px; }
  .kpi-btn.open { border-color: var(--sequential); box-shadow: 0 0 0 1px var(--sequential); }

  .kpi-info {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-top: 16px;
    padding: 14px 16px;
    background: white;
    border: 1px solid var(--border);
    border-left: 4px solid var(--sequential);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    font-size: 14px;
    color: var(--text-secondary);
  }
  .kpi-info strong { color: var(--text-primary); }
  .kpi-info p { margin: 4px 0 0 0; line-height: 1.5; }
  .info-close {
    border: none;
    background: none;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    color: var(--text-muted);
    padding: 0 4px;
  }
  .info-close:hover { color: var(--text-primary); }

  .chart { background: white; border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; box-shadow: var(--shadow); }
  .chart svg { width: 100%; height: auto; display: block; }

  .grid { stroke: var(--grid); stroke-width: 1; }
  .axis { fill: var(--text-muted); font-size: 11px; }
  .line { fill: none; stroke: var(--sequential); stroke-width: 2; stroke-linejoin: round; }
  .dot { fill: var(--sequential); stroke: var(--surface-1); stroke-width: 2; }

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
  .seg.seq { background: var(--sequential); }

  .bar-value { font-size: 13px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }

  .split { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; }
  .split-col { background: white; border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); }

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

  .modal-table {
    max-height: 60vh;
    overflow-y: auto;
  }

  .clickable {
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .clickable:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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
