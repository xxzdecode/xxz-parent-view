const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/model.js');

test('two students are always presented together', () => {
  assert.deepEqual(model.STUDENTS.map(item => item.name), ['芳菲', '启源']);
});

test('online summary keeps completion separate from claimed coins', () => {
  const date = '2026-08-26';
  const values = {
    student_reward_v1_sister: {
      daily: {
        [date]: {
          coins: 13,
          sources: { adventure: 5, vocabularyChallenge: 8, grammarChallenge: 0, classroomPractice: 0 },
          claims: {
            adventure: { status: 'claimed', amount: 5 },
            vocabularyChallenge: { status: 'pending', amount: 8 }
          }
        }
      }
    },
    vocab_adventure_v1_sister: {
      challengeDaily: { date, completions: [{ score: 80, correctCount: 8, completedAt: `${date}T10:00:00Z` }] }
    },
    grammar_challenge_daily_v1_sister: {},
    classroom_practice_daily_v1_sister: {}
  };
  const summary = model.onlineSummary('sister', date, values);
  assert.equal(summary.coins, 13);
  const challenge = summary.activities.find(item => item.type === 'vocabularyChallenge');
  assert.equal(challenge.completed, true);
  assert.equal(challenge.rewardPending, true);
  assert.equal(challenge.score, 80);
  assert.equal(challenge.correctCount, 8);
});

test('classroom practice never invents a score', () => {
  const date = '2026-08-26';
  const summary = model.onlineSummary('brother', date, {
    student_reward_v1_brother: { daily: { [date]: { coins: 10, sources: { classroomPractice: 10 } } } },
    classroom_practice_daily_v1_brother: { [date]: { status: 'completed', score: 100 } }
  });
  const classroom = summary.activities.find(item => item.type === 'classroomPractice');
  assert.equal(classroom.completed, true);
  assert.equal(classroom.score, null);
});

test('grading summary excludes teacher notes and exposes only counts', () => {
  const paper = model.papersFromCatalog({ papers: [{ paperId: 'p1', studentId: 'sister', title: '周测', totalQuestions: 10, sections: [
    { displayLabel: '一、选择题', items: Array.from({ length: 10 }, (_, index) => ({ questionId: `q${index + 1}`, displayLabel: `${index + 1}` })) }
  ] }] })[0];
  const summary = model.paperSummary(paper, {
    records: { p1: { paper_id: 'p1', wrong_question_ids: ['q2', 'q8'], teacher_note: 'private' } }
  }, { records: { p1: { photo_count: 2 } } });
  assert.equal(summary.correct, 8);
  assert.equal(summary.percent, 80);
  assert.deepEqual(summary.wrongIds, ['q2', 'q8']);
  assert.deepEqual(summary.wrongLabels, ['第 2 题', '第 8 题']);
  assert.equal(summary.media.photoCount, 2);
  assert.equal(Object.hasOwn(summary, 'teacher_note'), false);
});

test('paper photos stay isolated by paper and student', () => {
  const item = {
    paper_id: 'paper-sister',
    student_id: 'sister',
    photos: [{ id: 'one', data_url: 'data:image/webp;base64,AAAA' }]
  };
  assert.equal(model.mediaItemForPaper(item, 'paper-sister', 'sister').length, 1);
  assert.equal(model.mediaItemForPaper(item, 'paper-brother', 'brother').length, 0);
  assert.equal(model.mediaItemForPaper(item, 'paper-sister', 'brother').length, 0);
});

test('catalog inherits assessment fields and preserves both students', () => {
  const papers = model.papersFromCatalog({ assessments: [{
    assessment_id: 'a1', display_name: '8月日测', assessment_date: '2026-08-26', assessment_type: 'daily', papers: [
      { paper_id: 'p-s', student_id: 'sister', sections: [{ items: [{ question_id: 's1', kp_ids: ['k1'] }] }] },
      { paper_id: 'p-b', student_id: 'brother', sections: [{ items: [{ question_id: 'b1', kp_ids: ['k1'] }] }] }
    ]
  }] });
  assert.deepEqual(papers.map(item => [item.studentId, item.title]), [['sister', '8月日测'], ['brother', '8月日测']]);
});

test('score is calculated from answer counts when an old score is wrong', () => {
  const date = '2026-08-26';
  const summary = model.onlineSummary('sister', date, {
    student_reward_v1_sister: { daily: { [date]: { coins: 5, sources: { grammarChallenge: 5 } } } },
    grammar_challenge_daily_v1_sister: { [date]: { status: 'completed', score: 0, correctCount: 9, totalCount: 15 } }
  });
  const grammar = summary.activities.find(item => item.type === 'grammarChallenge');
  assert.equal(grammar.score, 60);
});

test('weaknesses are a flat overall list without distribution data', () => {
  const items = model.weaknessItems({ students: { sister: { groups: [
    { title: '句法', items: [{ weaknessId: 'w1', title: '一般疑问句', status: 'active', evidenceCount: 2 }] },
    { title: '时态', items: [{ weaknessId: 'w2', title: '一般过去时', status: 'improving', evidenceCount: 3 }] }
  ] } } }, 'sister');
  assert.deepEqual(items.map(item => item.title), ['一般疑问句', '一般过去时']);
  assert.equal(items.some(item => Object.hasOwn(item, 'group')), false);
});

test('same-day daily update is represented by one dated record', () => {
  const updates = model.normalizeDailyUpdates({ records: {
    '2026-08-26': { homework: ['完成数学练习'], sections: [{ title: '英语', items: ['学习形容词'] }] }
  } });
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].homework, ['完成数学练习']);
  assert.equal(model.dailyUpdateForDate(updates, '2026-08-26').title, '今日学习反馈');
  assert.equal(model.dailyUpdateForDate(updates, '2026-08-27'), null);
});
