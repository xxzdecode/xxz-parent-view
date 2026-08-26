(function parentViewModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ParentViewModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createParentViewModel() {
  'use strict';

  const STUDENTS = Object.freeze([
    { id: 'sister', name: '芳菲' },
    { id: 'brother', name: '启源' }
  ]);
  const ACTIVITY_LABELS = Object.freeze({
    adventure: '词汇探险',
    vocabularyChallenge: '单词挑战',
    grammarChallenge: '语法挑战',
    classroomPractice: '随堂练习'
  });
  const ACTIVITY_MAX = Object.freeze({ adventure: 5, vocabularyChallenge: 10, grammarChallenge: 5, classroomPractice: 10 });
  const ENGLISH_MODULE_LABELS = Object.freeze({
    A: 'A 已完成基础区',
    B: 'B 当前优先补强区',
    C: 'C 扩充句子区',
    D: 'D 时间轴区',
    E: 'E 句法与表达区',
    F: 'F 进阶储备区',
    R: '基础参考'
  });

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function strings(value) {
    return [...new Set((Array.isArray(value) ? value : []).map(item => String(item || '').trim()).filter(Boolean))];
  }

  function dateKey(value) {
    const source = value instanceof Date ? value : new Date(value || Date.now());
    if (!Number.isFinite(source.getTime())) return '';
    return `${source.getFullYear()}-${String(source.getMonth() + 1).padStart(2, '0')}-${String(source.getDate()).padStart(2, '0')}`;
  }

  function clamp(value, min, max) {
    const number = Math.round(Number(value) || 0);
    return Math.max(min, Math.min(max, number));
  }

  function activityResult(type, rewardDayValue, detailValue) {
    const rewardDay = object(rewardDayValue);
    const detail = object(detailValue);
    const sourceCoins = object(rewardDay.sources)[type];
    const claim = object(object(rewardDay.claims)[type]);
    const coins = clamp(sourceCoins ?? claim.amount, 0, ACTIVITY_MAX[type] || 0);
    const completed = detail.status === 'completed' || ['pending', 'claimed', 'completed'].includes(claim.status) || coins > 0;
    const correctCount = Number.isFinite(Number(detail.correctCount)) ? Math.max(0, Math.round(Number(detail.correctCount))) : null;
    const totalCount = Number.isFinite(Number(detail.totalCount))
      ? Math.max(0, Math.round(Number(detail.totalCount)))
      : type === 'vocabularyChallenge' && correctCount != null ? 10 : null;
    const recordedScore = detail.score !== null && detail.score !== '' && Number.isFinite(Number(detail.score))
      ? clamp(detail.score, 0, 100)
      : null;
    const calculatedScore = correctCount != null && totalCount
      ? Math.round(correctCount / totalCount * 100)
      : null;
    const score = calculatedScore != null ? calculatedScore : recordedScore;
    return {
      type,
      label: ACTIVITY_LABELS[type],
      completed,
      coins,
      maxCoins: ACTIVITY_MAX[type],
      score: ['vocabularyChallenge', 'grammarChallenge'].includes(type) ? score : null,
      correctCount: ['vocabularyChallenge', 'grammarChallenge'].includes(type) ? correctCount : null,
      totalCount: ['vocabularyChallenge', 'grammarChallenge'].includes(type) ? totalCount : null,
      title: String(detail.title || '').trim(),
      rewardPending: claim.status === 'pending'
    };
  }

  function onlineSummary(student, date, values) {
    const reward = object(values[`student_reward_v1_${student}`]);
    const rewardDay = object(object(reward.daily)[date]);
    const grammar = object(object(values[`grammar_challenge_daily_v1_${student}`])[date]);
    const classroom = object(object(values[`classroom_practice_daily_v1_${student}`])[date]);
    const stored = object(object(object(values[`parent_online_summary_v1_${student}`]).days)[date]);
    const storedActivities = object(stored.activities);
    const adventureState = object(values[`vocab_adventure_v1_${student}`]);
    const challengeDaily = object(adventureState.challengeDaily);
    const sameChallengeDay = challengeDaily.date === date;
    const challengeCompletion = sameChallengeDay && Array.isArray(challengeDaily.completions)
      ? [...challengeDaily.completions].sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')))[0]
      : null;
    const detailByType = {
      adventure: object(storedActivities.adventure),
      vocabularyChallenge: { ...object(storedActivities.vocabularyChallenge), ...object(challengeCompletion) },
      grammarChallenge: { ...object(storedActivities.grammarChallenge), ...grammar },
      classroomPractice: { ...object(storedActivities.classroomPractice), ...classroom }
    };
    const activities = Object.keys(ACTIVITY_LABELS).map(type => activityResult(type, rewardDay, detailByType[type]));
    return {
      student,
      date,
      coins: clamp(rewardDay.coins, 0, 30),
      maxCoins: 30,
      activities
    };
  }

  function normalizeItem(value, index) {
    const source = object(value);
    const questionId = String(source.questionId || source.question_id || source.id || '').trim();
    if (!questionId) return null;
    return {
      questionId,
      displayLabel: String(source.displayLabel || source.display_label || `第 ${index + 1} 小题`).trim(),
      ordinal: 0
    };
  }

  function normalizePaper(value, assessment) {
    const source = object(value);
    const parent = object(assessment);
    const studentValue = source.studentId || source.student_id || parent.studentId || parent.student_id;
    if (!['sister', 'brother'].includes(studentValue)) return null;
    let ordinal = 0;
    const sections = (Array.isArray(source.sections) ? source.sections : []).map((sectionValue, sectionIndex) => {
      const section = object(sectionValue);
      const items = (Array.isArray(section.items) ? section.items : [])
        .map((item, itemIndex) => normalizeItem(item, itemIndex))
        .filter(Boolean);
      items.forEach(item => { item.ordinal = ++ordinal; });
      return {
        displayLabel: String(section.displayLabel || section.display_label || section.title || `第 ${sectionIndex + 1} 大题`).trim(),
        items
      };
    }).filter(section => section.items.length);
    const assessmentId = String(parent.assessmentId || parent.assessment_id || parent.id || source.assessmentId || source.assessment_id || '').trim();
    const paperId = String(source.paperId || source.paper_id || source.id || '').trim();
    if (!paperId) return null;
    return {
      assessmentId,
      paperId,
      studentId: studentValue,
      title: String(source.displayName || source.display_name || source.title || parent.displayName || parent.display_name || parent.title || '练习').trim(),
      assessmentDate: String(source.assessmentDate || source.assessment_date || parent.assessmentDate || parent.assessment_date || '').slice(0, 10),
      assessmentType: String(source.assessmentType || source.assessment_type || parent.assessmentType || parent.assessment_type || 'daily').trim(),
      totalQuestions: Math.max(0, Number(source.totalQuestions || source.total_questions) || sections.reduce((sum, section) => sum + section.items.length, 0)),
      sections
    };
  }

  function papersFromCatalog(value) {
    const source = object(value);
    if (Array.isArray(source.papers)) return source.papers.map(paper => normalizePaper(paper, source)).filter(Boolean);
    const assessments = Array.isArray(source.assessments) ? source.assessments : Array.isArray(value) ? value : [];
    return assessments.flatMap(assessment => {
      const papers = Array.isArray(object(assessment).papers) ? object(assessment).papers : [assessment];
      return papers.map(paper => normalizePaper(paper, assessment)).filter(Boolean);
    });
  }

  function gradingRecord(value, paperId) {
    const source = object(value);
    const records = object(source.records);
    return object(records[paperId]);
  }

  function mediaForPaper(value, paperId) {
    const source = object(value);
    const records = object(source.records || source);
    const record = object(records[paperId]);
    return {
      photoCount: Math.max(0, Number(record.photoCount || record.photo_count) || strings(record.urls || record.photoUrls || record.photo_urls).length),
      updatedAt: String(record.updatedAt || record.updated_at || '').trim()
    };
  }

  function mediaItemForPaper(value, paperId, studentId) {
    const source = object(value);
    const storedPaperId = String(source.paperId || source.paper_id || '').trim();
    const storedStudentId = String(source.studentId || source.student_id || '').trim();
    if (storedPaperId && storedPaperId !== paperId) return [];
    if (storedStudentId && studentId && storedStudentId !== studentId) return [];
    return (Array.isArray(source.photos) ? source.photos : []).map(photoValue => {
      const photo = object(photoValue);
      const dataUrl = String(photo.dataUrl || photo.data_url || '').trim();
      if (!/^data:image\/(?:webp|jpeg|png);base64,/i.test(dataUrl)) return null;
      return { id: String(photo.id || '').trim(), dataUrl };
    }).filter(Boolean).slice(0, 4);
  }

  function paperSummary(paper, gradingValue, mediaValue) {
    const record = gradingRecord(gradingValue, paper.paperId);
    const wrongIds = strings(record.wrongQuestionIds || record.wrong_question_ids);
    const graded = Boolean(record.paperId || record.paper_id || record.savedAt || record.saved_at || wrongIds.length || record.allCorrect);
    const correct = graded ? Math.max(0, paper.totalQuestions - wrongIds.length) : null;
    const percent = graded && paper.totalQuestions ? Math.round(correct / paper.totalQuestions * 100) : null;
    const itemById = new Map(paper.sections.flatMap(section => section.items.map(item => [item.questionId, { section, item }])));
    const wrongLabels = wrongIds.map(questionId => {
      const found = itemById.get(questionId);
      if (!found) return '';
      if (paper.assessmentType === 'daily') return `第 ${found.item.ordinal} 题`;
      return `${found.section.displayLabel} ${found.item.displayLabel}`.trim();
    }).filter(Boolean);
    return {
      ...paper,
      graded,
      wrongIds,
      wrongLabels,
      correct,
      percent,
      media: mediaForPaper(mediaValue, paper.paperId)
    };
  }

  function weaknessItems(value, student) {
    const source = object(value);
    const studentValue = object(object(source.students)[student]);
    const directItems = Array.isArray(studentValue.items) ? studentValue.items : [];
    const groupItems = (Array.isArray(studentValue.groups) ? studentValue.groups : []).flatMap(group => Array.isArray(object(group).items) ? object(group).items : []);
    return [...directItems, ...groupItems].map(item => ({
      id: String(object(item).weaknessId || object(item).weakness_id || '').trim(),
      title: String(object(item).title || '').trim(),
      status: object(item).status === 'improving' ? 'improving' : 'active',
      evidenceCount: Math.max(0, Number(object(item).evidenceCount || object(item).evidence_count) || 0)
    })).filter(item => item.id && item.title).filter((item, index, array) => array.findIndex(other => other.id === item.id) === index);
  }

  function normalizeDailyUpdates(value) {
    const source = object(value);
    const records = object(source.records || source);
    return Object.entries(records).map(([date, entryValue]) => {
      const entry = object(entryValue);
      return {
        date,
        title: String(entry.title || '今日学习反馈').trim(),
        homework: strings(entry.homework),
        sections: (Array.isArray(entry.sections) ? entry.sections : []).map(section => ({
          title: String(object(section).title || '').trim(),
          items: strings(object(section).items)
        })).filter(section => section.title && section.items.length),
        updatedAt: String(entry.updatedAt || entry.updated_at || '').trim()
      };
    }).filter(entry => /^\d{4}-\d{2}-\d{2}$/.test(entry.date)).sort((a, b) => b.date.localeCompare(a.date));
  }

  function englishKnowledge(topicsValue, progressValue) {
    const topics = Array.isArray(topicsValue) ? topicsValue : [];
    const source = object(progressValue);
    const rows = Array.isArray(source.topics)
      ? source.topics
      : Object.entries(object(source.topics || source)).map(([topicKey, row]) => ({ topicKey, ...object(row) }));
    const progress = new Map(rows.map(row => [String(row.topicKey || row.topic_key || ''), String(row.status || '')]));
    return topics.map(topic => {
      const key = String(object(topic).topicKey || '');
      const status = progress.get(key) || 'not_started';
      return {
        id: key,
        title: String(object(topic).titleZh || object(topic).title || '').trim(),
        group: ENGLISH_MODULE_LABELS[String(object(topic).moduleKey || '')] || '其他知识点',
        order: Number(object(topic).sequenceOrder) || 9999,
        status: status === 'confirmed_complete' ? 'done' : ['materials_ready', 'to_teach', 'needs_review'].includes(status) ? 'learning' : 'pending'
      };
    }).filter(item => item.id && item.title).sort((a, b) => a.order - b.order);
  }

  function mathKnowledge(catalogValue, progressValue) {
    const catalog = object(catalogValue);
    const progressSource = object(progressValue);
    const records = Array.isArray(progressSource.records) ? progressSource.records : [];
    const byStudent = new Map(records.map(record => [`${record.student_id}:${record.knowledge_id}`, record]));
    const items = object(catalog.knowledge_points || catalog.knowledgePoints);
    const result = [];
    Object.entries(items).forEach(([id, value]) => {
      const item = object(value);
      const statuses = STUDENTS.map(student => object(byStudent.get(`${student.id}:${id}`)));
      const status = statuses.some(row => row.mastery_status === 'stable' || row.display_status === 'green')
        ? 'done'
        : statuses.some(row => row.mastery_status === 'reinforce' || row.display_status === 'red')
          ? 'reinforce'
          : statuses.some(row => ['learning', 'taught_by_us'].includes(row.teaching_status) || row.display_status === 'yellow' || row.handoff_status === 'reported_taught')
            ? 'learning'
            : 'pending';
      result.push({
        id,
        title: String(item.title || item.name || id),
        group: String(item.grade ? `${item.grade}年级` : item.domain || '数学'),
        order: Number(item.sequence || item.order) || 9999,
        status
      });
    });
    return result.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-CN'));
  }

  return {
    STUDENTS,
    ACTIVITY_LABELS,
    dateKey,
    onlineSummary,
    papersFromCatalog,
    paperSummary,
    mediaItemForPaper,
    weaknessItems,
    normalizeDailyUpdates,
    englishKnowledge,
    mathKnowledge
  };
});
