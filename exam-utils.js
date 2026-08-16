function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeQuotas(quotas) {
  const merged = new Map();
  for (const raw of Array.isArray(quotas) ? quotas : []) {
    const subject = String(raw?.subject || "")
      .trim()
      .slice(0, 30);
    const knowledge = String(raw?.knowledge || raw?.module || "")
      .trim()
      .slice(0, 60);
    const questionType = String(raw?.questionType || "未分类题型")
      .trim()
      .slice(0, 30);
    const count = Math.max(
      0,
      Math.min(100, Math.floor(Number(raw?.count) || 0)),
    );
    if (!subject || !knowledge || !questionType || !count) continue;
    const key = `${subject}\u0000${knowledge}\u0000${questionType}`;
    const previous = merged.get(key);
    merged.set(key, {
      subject,
      knowledge,
      questionType,
      count: Math.min(100, (previous?.count || 0) + count),
    });
  }
  return [...merged.values()];
}

function reviewTier(question, done, today, now) {
  const completedToday = (done?.[today] || []).some(
    (id) => String(id) === String(question.id),
  );
  if (completedToday) return 3;
  if ((Number(question.reviewCount) || 0) === 0) return 0;
  const dueAt = question.nextReview
    ? new Date(question.nextReview).getTime()
    : 0;
  return !Number.isFinite(dueAt) || dueAt <= now.getTime() ? 1 : 2;
}

function selectExamQuestions({
  questions,
  quotas,
  history,
  done = {},
  now = new Date(),
}) {
  const normalizedQuotas = normalizeQuotas(quotas);
  const papers = Array.isArray(history) ? history : [];
  const usage = new Map(),
    lastUsed = new Map(),
    chosen = new Set();
  papers.forEach((paper, index) =>
    (paper?.questionIds || []).forEach((id) => {
      const key = String(id);
      usage.set(key, (usage.get(key) || 0) + 1);
      if (!lastUsed.has(key)) lastUsed.set(key, index);
    }),
  );
  const today = localDateKey(now),
    selected = [],
    missing = [];
  for (const quota of normalizedQuotas) {
    let pool = (Array.isArray(questions) ? questions : []).filter(
      (question) =>
        question &&
        !question.deletedAt &&
        !chosen.has(String(question.id)) &&
        String(question.subject || "") === quota.subject &&
        String(
          (Array.isArray(question.knowledgePath)
            ? question.knowledgePath[0]
            : "") ||
            question.module ||
            question.unit ||
            "未分类",
        ) === quota.knowledge &&
        String(question.questionType || "未分类题型") === quota.questionType,
    );
    const notCompletedToday = pool.filter(
      (question) => reviewTier(question, done, today, now) < 3,
    );
    if (notCompletedToday.length >= quota.count) pool = notCompletedToday;
    pool.sort((a, b) => {
      const aId = String(a.id),
        bId = String(b.id);
      const aLast = lastUsed.has(aId)
        ? -lastUsed.get(aId)
        : Number.NEGATIVE_INFINITY;
      const bLast = lastUsed.has(bId)
        ? -lastUsed.get(bId)
        : Number.NEGATIVE_INFINITY;
      const aDue = a.nextReview ? new Date(a.nextReview).getTime() : 0;
      const bDue = b.nextReview ? new Date(b.nextReview).getTime() : 0;
      return (
        (usage.get(aId) || 0) - (usage.get(bId) || 0) ||
        reviewTier(a, done, today, now) - reviewTier(b, done, today, now) ||
        aLast - bLast ||
        (Number.isFinite(aDue) ? aDue : 0) -
          (Number.isFinite(bDue) ? bDue : 0) ||
        (Number(a.reviewCount) || 0) - (Number(b.reviewCount) || 0) ||
        String(a.createdAt || "").localeCompare(String(b.createdAt || "")) ||
        aId.localeCompare(bId)
      );
    });
    const picked = pool.slice(0, quota.count);
    picked.forEach((question) => chosen.add(String(question.id)));
    selected.push(...picked);
    if (picked.length < quota.count)
      missing.push({
        ...quota,
        requested: quota.count,
        available: picked.length,
      });
  }
  return { selected, missing, quotas: normalizedQuotas };
}

module.exports = {
  localDateKey,
  normalizeQuotas,
  reviewTier,
  selectExamQuestions,
};
