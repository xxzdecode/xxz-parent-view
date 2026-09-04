(function parentViewApp(root) {
  'use strict';
  const model = root.ParentViewModel;
  const config = root.PARENT_VIEW_CONFIG || {};
  const params = new URLSearchParams(root.location.search);
  const dailyCardMode = params.get('view') === 'daily-card';
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : model.dateKey();
  const state = { values: {}, topics: [], mathCatalog: {}, dailyHistory: [], subject: 'english', today: model.dateKey(), date: requestedDate };
  const typeLabels = { daily: '日测', weekly: '周测', monthly: '月测', pro: '薄弱专项', homework: '作业' };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function formatDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    return match ? `${Number(match[2])}月${Number(match[3])}日` : String(value || '');
  }

  function shortTime(value) {
    const date = new Date(value || '');
    if (!Number.isFinite(date.getTime())) return '';
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  async function kvGet(key) {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/kv_store?key=eq.${encodeURIComponent(key)}&select=value`, {
      headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}` },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`读取失败 ${response.status}`);
    const rows = await response.json();
    return rows.length ? rows[0].value : null;
  }

  async function jsonGet(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`读取失败 ${response.status}`);
    return response.json();
  }

  function mediaItemKey(paperId) {
    return `parent_assessment_media_item_v1_${encodeURIComponent(String(paperId || '').trim())}`;
  }

  async function openPaperPhotos(paperId, studentId, title) {
    const dialog = document.getElementById('photoDialog');
    const body = document.getElementById('photoDialogBody');
    document.getElementById('photoDialogTitle').textContent = title || '卷子照片';
    body.className = 'photo-dialog__body loading-card';
    body.textContent = '正在读取照片…';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    try {
      const photos = model.mediaItemForPaper(await kvGet(mediaItemKey(paperId)), paperId, studentId);
      body.className = 'photo-dialog__body';
      if (!photos.length) {
        body.classList.add('empty');
        body.textContent = '暂时没有照片';
        return;
      }
      body.innerHTML = photos.map((photo, index) => `<img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(title || '卷子')} 第 ${index + 1} 张">`).join('');
    } catch (_) {
      body.className = 'photo-dialog__body empty';
      body.textContent = '照片暂时无法读取，请稍后再试';
    }
  }

  function activityMeta(item) {
    if (!item.completed) return '尚未完成';
    const result = item.score != null
      ? `${item.score} 分${item.correctCount != null && item.totalCount ? ` · 答对 ${item.correctCount}/${item.totalCount}` : ''}`
      : '已完成';
    return `${result} · ${item.coins}/${item.maxCoins} 金币${item.rewardPending ? '（待领取）' : ''}`;
  }

  function compactActivityMeta(item) {
    if (!item.completed) return '未完成';
    if (item.score != null) return `${item.score}分`;
    return `${item.coins}/${item.maxCoins}`;
  }

  function allPapers() {
    return model.papersFromCatalog(state.values.assessment_catalog_v1)
      .filter(paper => !paper.assessmentDate || paper.assessmentDate <= state.today)
      .sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate) || b.paperId.localeCompare(a.paperId));
  }

  function summarizedPapers(studentId, limit, exactDate) {
    return allPapers().filter(paper => paper.studentId === studentId && (!exactDate || paper.assessmentDate === exactDate))
      .map(paper => model.paperSummary(paper, state.values[`assessment_grading_v1_${studentId}`], state.values.parent_assessment_media_v1))
      .filter(row => row.graded)
      .slice(0, limit);
  }

  function mergedDailyUpdates() {
    const byDate = new Map(state.dailyHistory.map(entry => [entry.date, entry]));
    model.normalizeDailyUpdates(state.values.parent_daily_updates_v1).forEach(entry => byDate.set(entry.date, entry));
    return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  }

  function visibleWeaknesses(items) {
    const active = items.filter(item => item.status === 'active');
    const improving = items.filter(item => item.status === 'improving');
    return [...active, ...improving];
  }

  function renderHomework(updates) {
    const target = document.getElementById('homeworkList');
    const entry = updates.find(item => item.date === state.today);
    if (!entry || !entry.homework.length) {
      target.className = 'homework-list empty';
      target.textContent = '今日暂无作业记录';
      return;
    }
    target.className = 'homework-list';
    target.innerHTML = entry.homework.map((item, index) => `<div class="homework-item"><b>${index + 1}</b><span>${escapeHtml(item)}</span></div>`).join('');
  }

  function renderOnline() {
    const target = document.getElementById('onlineStudents');
    target.className = 'student-stack paired-grid';
    target.innerHTML = model.STUDENTS.map(student => {
      const summary = model.onlineSummary(student.id, state.today, state.values);
      return `<article class="student-card student-card--compact">
        <div class="student-card__heading"><h3>${student.name}</h3><strong>${summary.coins} / 30</strong></div>
        <div class="activity-list activity-list--compact">${summary.activities.map(item => `<div class="activity-row activity-row--compact">
          <strong>${item.label}</strong><small class="${item.completed ? 'is-complete' : ''}">${escapeHtml(compactActivityMeta(item))}</small>
        </div>`).join('')}</div>
      </article>`;
    }).join('');
  }

  function renderTodayGrading() {
    const target = document.getElementById('todayGrading');
    target.className = 'paired-grid';
    target.innerHTML = model.STUDENTS.map(student => {
      const row = summarizedPapers(student.id, 1, state.today)[0];
      if (!row) return `<article class="student-card student-card--compact"><div class="student-card__heading"><h3>${student.name}</h3></div><div class="compact-empty">今天暂无</div></article>`;
      return `<article class="student-card student-card--compact"><div class="student-card__heading"><h3>${student.name}</h3><span class="status ${row.wrongIds.length ? 'status--wrong' : 'status--done'}">已批改</span></div>
        <strong class="compact-paper-title">${escapeHtml(row.title)}</strong>
        <small>对 ${row.correct}/${row.totalQuestions} · ${row.percent}%</small>
        <small>${row.wrongIds.length ? `错题：${row.wrongLabels.length ? row.wrongLabels.map(escapeHtml).join('、') : `${row.wrongIds.length}题`}` : '全部正确'}</small>
      </article>`;
    }).join('');
  }

  function renderTodayDaily(updates) {
    const target = document.getElementById('todayDaily');
    const entry = updates.find(item => item.date === state.today);
    if (!entry) {
      target.className = 'daily-detail daily-detail--home empty';
      target.textContent = '今天暂无日报';
      return;
    }
    target.className = 'daily-detail daily-detail--home';
    target.innerHTML = entry.sections.map(section => `<section><h4>${escapeHtml(section.title)}</h4>${section.items.length === 1 ? `<p>${escapeHtml(section.items[0])}</p>` : `<ul>${section.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`}</section>`).join('');
  }

  function renderDailyCard(updates) {
    if (!dailyCardMode) return;
    const target = document.getElementById('dailyCardContent');
    const entry = model.dailyUpdateForDate(updates, state.date);
    document.getElementById('dailyCardDate').textContent = formatDate(state.date);
    document.getElementById('dailyCardTitle').textContent = entry?.title || '今日学习反馈';
    if (!entry) {
      target.className = 'daily-card__content empty';
      target.textContent = '这一天还没有学习反馈';
      return;
    }
    const sections = entry.sections.map(section => `<section><h2>${escapeHtml(section.title)}</h2>${section.items.map(item => {
      const weakness = /^薄弱点[：:]\s*/.test(item);
      return `<p${weakness ? ' class="daily-card__weakness"' : ''}>${escapeHtml(item)}</p>`;
    }).join('')}</section>`).join('');
    const homework = entry.homework.length
      ? `<section class="daily-card__homework"><h2>今日作业</h2><ol>${entry.homework.map(item => `<li>${escapeHtml(item.replace(/^\d+[.、]\s*/, ''))}</li>`).join('')}</ol></section>`
      : '';
    target.className = 'daily-card__content';
    target.innerHTML = sections + homework;
  }

  function renderOnlineHistory() {
    const target = document.getElementById('onlineHistory');
    const dates = [...new Set(model.STUDENTS.flatMap(student => Object.keys((state.values[`student_reward_v1_${student.id}`] || {}).daily || {})))]
      .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= state.today)
      .sort((a, b) => b.localeCompare(a));
    target.className = 'history-list';
    if (!dates.length) {
      target.innerHTML = '<div class="empty">暂无历史记录</div>';
      return;
    }
    target.innerHTML = dates.map((date, index) => `<details class="history-day" ${index === 0 ? 'open' : ''}>
      <summary>${formatDate(date)}</summary>
      <div class="paired-grid">${model.STUDENTS.map(student => {
        const hasRecord = Boolean((state.values[`student_reward_v1_${student.id}`] || {}).daily?.[date]);
        if (!hasRecord) return `<article class="student-card student-card--compact"><div class="student-card__heading"><h3>${student.name}</h3></div><div class="compact-empty">暂无记录</div></article>`;
        const summary = model.onlineSummary(student.id, date, state.values);
        return `<article class="student-card student-card--compact"><div class="student-card__heading"><h3>${student.name}</h3><strong>${summary.coins}/30</strong></div><div class="activity-list activity-list--compact">${summary.activities.map(item => `<div class="activity-row activity-row--compact"><strong>${item.label}</strong><small class="${item.completed ? 'is-complete' : ''}">${escapeHtml(compactActivityMeta(item))}</small></div>`).join('')}</div></article>`;
      }).join('')}</div>
    </details>`).join('');
  }

  function renderGrading() {
    const target = document.getElementById('gradingStudents');
    const byStudent = Object.fromEntries(model.STUDENTS.map(student => [student.id, summarizedPapers(student.id, Number.MAX_SAFE_INTEGER)]));
    const months = [...new Set(model.STUDENTS.flatMap(student => byStudent[student.id].map(row => row.assessmentDate.slice(0, 7))))].filter(Boolean).sort((a, b) => b.localeCompare(a));
    const latestId = Object.fromEntries(model.STUDENTS.map(student => [student.id, byStudent[student.id][0]?.paperId || '']));
    target.className = 'history-list';
    target.innerHTML = months.length ? months.map((month, monthIndex) => `<details class="month-group" ${monthIndex === 0 ? 'open' : ''}>
      <summary>${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月</summary>
      <div class="paired-grid">${model.STUDENTS.map(student => {
        const rows = byStudent[student.id].filter(row => row.assessmentDate.startsWith(month));
        return `<article class="student-card"><div class="student-card__heading"><h3>${student.name}</h3></div><div class="record-list">${rows.length ? rows.map(row => `<article class="record-row${row.paperId === latestId[student.id] ? ' record-row--latest' : ''}">
          <div class="record-row__top"><strong>${escapeHtml(row.title)}</strong><span class="status ${row.wrongIds.length ? 'status--wrong' : 'status--done'}">已批改</span></div>
          <small class="record-date">${row.paperId === latestId[student.id] ? '<b>最新</b>' : ''}${formatDate(row.assessmentDate)} · ${typeLabels[row.assessmentType] || '练习'} · 对 ${row.correct}/${row.totalQuestions} · ${row.percent}%</small>
          ${row.wrongIds.length ? `<small>错题：${row.wrongLabels.length ? row.wrongLabels.map(escapeHtml).join('、') : `${row.wrongIds.length} 题`}</small>` : '<small>本次全部正确</small>'}
          ${row.media.photoCount ? `<button type="button" class="photo-button" data-paper-photo="${escapeHtml(row.paperId)}" data-paper-student="${escapeHtml(row.studentId)}" data-paper-title="${escapeHtml(row.title)}">查看卷子照片（${row.media.photoCount}）</button>` : ''}
        </article>`).join('') : '<div class="empty">本月暂无记录</div>'}</div></article>`;
      }).join('')}</div>
    </details>`).join('') : '<div class="empty">暂无已完成的测验</div>';
  }

  function renderWeakness() {
    const target = document.getElementById('weaknessStudents');
    target.className = 'student-stack paired-grid';
    target.innerHTML = model.STUDENTS.map(student => {
      const items = visibleWeaknesses(model.weaknessItems(state.values.assessment_weakness_view_v1, student.id));
      const firstItems = items.slice(0, 6);
      const remainingItems = items.slice(6);
      const itemHtml = item => `<li><strong>${escapeHtml(item.title)}</strong><small>${item.status === 'improving' ? '正在巩固' : '需要巩固'}${item.evidenceCount ? ` · ${item.evidenceCount} 条学习记录` : ''}</small></li>`;
      return `<article class="student-card"><div class="student-card__heading"><h3>${student.name}</h3></div>
        ${items.length ? `<ul class="weakness-list">${firstItems.map(itemHtml).join('')}</ul>${remainingItems.length ? `<details class="more-list"><summary>查看其余 ${remainingItems.length} 项</summary><ul class="weakness-list">${remainingItems.map(itemHtml).join('')}</ul></details>` : ''}` : '<div class="empty">暂时没有需要特别巩固的知识点</div>'}
      </article>`;
    }).join('');
  }

  function monthDays(dateValue) {
    const date = new Date(`${dateValue}T12:00:00`);
    const year = date.getFullYear();
    const month = date.getMonth();
    const first = new Date(year, month, 1);
    const total = new Date(year, month + 1, 0).getDate();
    return { year, month, leading: first.getDay(), total };
  }

  function renderDaily(updates) {
    const target = document.getElementById('dailyCalendar');
    const detail = document.getElementById('dailyDetail');
    const available = new Set(updates.map(item => item.date));
    const month = monthDays(state.date);
    const heads = ['日', '一', '二', '三', '四', '五', '六'].map(day => `<div class="calendar-head">${day}</div>`).join('');
    const blanks = Array.from({ length: month.leading }, () => '<button class="calendar-day" disabled></button>').join('');
    const days = Array.from({ length: month.total }, (_, index) => {
      const day = index + 1;
      const key = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const has = available.has(key);
      return `<button type="button" class="calendar-day${has ? ' has-entry' : ''}${key === state.date ? ' is-selected' : ''}" data-date="${key}" ${has ? '' : 'disabled'}>${day}</button>`;
    }).join('');
    target.className = 'calendar';
    target.innerHTML = heads + blanks + days;
    target.querySelectorAll('[data-date]').forEach(button => button.addEventListener('click', () => {
      state.date = button.dataset.date;
      document.getElementById('dayPicker').value = state.date;
      renderAll();
    }));
    const entry = updates.find(item => item.date === state.date);
    if (!entry) {
      detail.hidden = true;
      detail.replaceChildren();
      return;
    }
    detail.hidden = false;
    detail.innerHTML = `<h3>${formatDate(entry.date)} · ${escapeHtml(entry.title)}</h3>${entry.sections.map(section => `<section><h4>${escapeHtml(section.title)}</h4>${section.items.length === 1 ? `<p>${escapeHtml(section.items[0])}</p>` : `<ul>${section.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`}</section>`).join('')}${entry.homework.length ? `<section><h4>今日作业</h4><ul>${entry.homework.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>` : ''}`;
  }

  function knowledgeStatusLabel(status) {
    return status === 'done' ? '已完成' : status === 'reinforce' ? '需巩固' : status === 'learning' ? '学习中' : '待学习';
  }

  function renderKnowledge() {
    const target = document.getElementById('knowledgeContent');
    const items = state.subject === 'english'
      ? model.englishKnowledge(state.topics, state.values.grammar_progress)
      : model.mathKnowledge(state.mathCatalog, state.values.math_parent_progress_v1);
    if (!items.length) {
      target.className = 'knowledge-content empty';
      target.textContent = '知识点正在整理中';
      return;
    }
    const counts = {
      done: items.filter(item => item.status === 'done').length,
      learning: items.filter(item => ['learning', 'reinforce'].includes(item.status)).length,
      pending: items.filter(item => item.status === 'pending').length
    };
    const groups = new Map();
    items.forEach(item => {
      if (!groups.has(item.group)) groups.set(item.group, []);
      groups.get(item.group).push(item);
    });
    target.className = 'knowledge-content';
    const percent = items.length ? Math.round(counts.done / items.length * 100) : 0;
    target.innerHTML = `<div class="knowledge-total"><div><strong>总进度</strong><b>${percent}%</b></div><span><i style="width:${percent}%"></i></span><small>已完成 ${counts.done} / ${items.length} 个知识点</small></div><div class="knowledge-summary"><div><strong>${counts.done}</strong><small>已完成</small></div><div><strong>${counts.learning}</strong><small>学习/巩固中</small></div><div><strong>${counts.pending}</strong><small>待学习</small></div></div>
      ${[...groups.entries()].map(([group, rows], index) => `<details class="knowledge-group" ${index === 0 ? 'open' : ''}><summary>${escapeHtml(group)} · ${rows.length}项</summary><div class="knowledge-list">${rows.map(item => `<div class="knowledge-item"><span class="knowledge-dot knowledge-dot--${item.status}"></span><span>${escapeHtml(item.title)} · ${knowledgeStatusLabel(item.status)}</span></div>`).join('')}</div></details>`).join('')}`;
  }

  function renderAll() {
    const updates = mergedDailyUpdates();
    if (dailyCardMode) {
      renderDailyCard(updates);
      return;
    }
    renderHomework(updates);
    renderOnline();
    renderOnlineHistory();
    renderTodayGrading();
    renderTodayDaily(updates);
    renderGrading();
    renderWeakness();
    renderDaily(updates);
    renderKnowledge();
    const timestamps = [
      ...updates.map(item => item.updatedAt),
      String((state.values.assessment_weakness_view_v1 || {}).sourceUpdatedAt || ''),
      String((state.values.assessment_catalog_v1 || {}).updatedAt || '')
    ].filter(Boolean).sort();
    document.getElementById('updatedAt').textContent = timestamps.length ? `更新于 ${shortTime(timestamps.at(-1))}` : '最新记录';
  }

  async function load() {
    document.getElementById('dayPicker').value = state.date;
    if (dailyCardMode) {
      await Promise.allSettled([
        kvGet('parent_daily_updates_v1').then(value => { state.values.parent_daily_updates_v1 = value; }),
        jsonGet(config.dailyHistoryUrl).then(value => { state.dailyHistory = model.normalizeDailyUpdates(value); })
      ]);
      renderAll();
      return;
    }
    const keys = [
      'parent_daily_updates_v1', 'parent_assessment_media_v1', 'assessment_catalog_v1', 'assessment_weakness_view_v1',
      'grammar_progress', 'math_parent_progress_v1',
      ...model.STUDENTS.flatMap(student => [
        `assessment_grading_v1_${student.id}`,
        `student_reward_v1_${student.id}`,
        `grammar_challenge_daily_v1_${student.id}`,
        `classroom_practice_daily_v1_${student.id}`,
        `vocab_adventure_v1_${student.id}`,
        `parent_online_summary_v1_${student.id}`
      ])
    ];
    const results = await Promise.allSettled([
      ...keys.map(key => kvGet(key).then(value => { state.values[key] = value; })),
      jsonGet(config.englishTopicsUrl).then(value => { state.topics = value; }),
      jsonGet(config.mathCatalogUrl).then(value => { state.mathCatalog = value; }),
      jsonGet(config.dailyHistoryUrl).then(value => { state.dailyHistory = model.normalizeDailyUpdates(value); })
    ]);
    renderAll();
    if (results.every(result => result.status === 'rejected')) document.getElementById('updatedAt').textContent = '暂时无法更新';
  }

  if (dailyCardMode) {
    document.getElementById('homeView').hidden = true;
    document.getElementById('detailView').hidden = true;
    document.querySelector('.topbar').hidden = true;
    document.querySelector('body > footer').hidden = true;
    document.getElementById('dailyCardView').hidden = false;
  }

  document.getElementById('dayPicker').addEventListener('change', event => {
    if (!event.target.value) return;
    state.date = event.target.value;
    renderAll();
  });
  function openDetail(name) {
    document.getElementById('homeView').hidden = true;
    document.getElementById('detailView').hidden = false;
    document.querySelectorAll('.detail-screen').forEach(section => { section.hidden = section.dataset.detail !== name; });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  document.querySelectorAll('[data-open-detail]').forEach(button => button.addEventListener('click', () => openDetail(button.dataset.openDetail)));
  document.getElementById('backHome').addEventListener('click', () => {
    document.getElementById('detailView').hidden = true;
    document.getElementById('homeView').hidden = false;
    document.querySelectorAll('.detail-screen').forEach(section => { section.hidden = true; });
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  document.querySelectorAll('[data-subject]').forEach(button => button.addEventListener('click', () => {
    state.subject = button.dataset.subject;
    document.querySelectorAll('[data-subject]').forEach(item => item.classList.toggle('is-active', item === button));
    renderKnowledge();
  }));
  document.getElementById('gradingStudents').addEventListener('click', event => {
    const button = event.target.closest('[data-paper-photo]');
    if (!button) return;
    openPaperPhotos(button.dataset.paperPhoto, button.dataset.paperStudent, button.dataset.paperTitle);
  });
  document.getElementById('closePhotoDialog').addEventListener('click', () => document.getElementById('photoDialog').close());
  document.getElementById('photoDialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  load().catch(() => {
    document.querySelectorAll('.loading-card').forEach(node => { node.className = 'empty'; node.textContent = '暂时无法读取，请稍后再试'; });
    document.getElementById('updatedAt').textContent = '暂时无法更新';
  });
})(window);
