// типы занятий и их цвета (используются в занятиях и расписании)
export const LESSON_TYPES = {
  lecture: { name: 'Лекция', color: '#3b82f6' },
  practice: { name: 'Практика', color: '#10b981' },
  lab: { name: 'Лабораторная', color: '#f59e0b' },
  consultation: { name: 'Консультация', color: '#8b5cf6' },
  seminar: { name: 'Семинар', color: '#ef4444' }
};

// время пар
export const TIME_SLOTS = {
  1: '08:30 - 10:00',
  2: '10:10 - 11:40',
  3: '11:50 - 13:20',
  4: '13:50 - 15:20',
  5: '15:30 - 17:00',
  6: '17:10 - 18:40'
};

export const LESSON_STATUSES = {
  pending: { name: 'Закрыто', icon: '🔒' },
  open: { name: 'Открыто', icon: '▶️' },
  completed: { name: 'Завершено', icon: '✅' }
};

// виды оценок
export const GRADE_TYPES = {
  control: 'Контрольные',
  independent: 'Самостоятельные',
  laboratory: 'Лабораторные',
  board: 'Выход к доске',
  final: 'Финальная'
};

export const GRADE_TYPE_ONE = {
  control: 'Контрольная',
  independent: 'Самостоятельная',
  laboratory: 'Лабораторная',
  board: 'Выход к доске',
  final: 'Финальная'
};

// иконки последних действий студента
export const ACTIVITY_ICONS = {
  lesson_view: '📖',
  submission: '📤',
  grade: '⭐',
  attendance: '✔️',
  reply: '💬',
  course_complete: '🏁'
};
