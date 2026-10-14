// ===== Общие вспомогательные функции =====

// ошибка с HTTP-статусом и текстом для пользователя
class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// обертка для async-маршрутов: ошибки передаются в общий обработчик
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

// id - целое положительное число
const isId = (value) => Number.isInteger(Number(value)) && Number(value) > 0;

// дата в формате ГГГГ-ММ-ДД
const isDate = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(new Date(value + 'T00:00:00').getTime());

const pad = (n) => String(n).padStart(2, '0');

// сегодняшняя дата ГГГГ-ММ-ДД
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// текущие дата и время ГГГГ-ММ-ДД ЧЧ:ММ:СС
const now = () => {
  const d = new Date();
  return `${today()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// дата и время через n часов
const hoursFromNow = (hours) => {
  const d = new Date(Date.now() + hours * 60 * 60 * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// ФИО из строки результата (поля last_name, first_name, patronymic с префиксом или без)
const fullName = (row, prefix = '') =>
  [row[prefix + 'last_name'], row[prefix + 'first_name'], row[prefix + 'patronymic']]
    .filter(part => part)
    .join(' ');

// список "?, ?, ?" для условия IN (...)
const placeholders = (list) => list.map(() => '?').join(', ');

// непустая строка
const text = (value) => (typeof value === 'string' ? value.trim() : '');

// типы занятий и оценок
const LESSON_TYPES = ['lecture', 'practice', 'lab', 'consultation', 'seminar'];
const LESSON_TYPE_NAMES = {
  lecture: 'Лекция',
  practice: 'Практика',
  lab: 'Лабораторная',
  consultation: 'Консультация',
  seminar: 'Семинар'
};
const GRADE_TYPES = ['control', 'independent', 'laboratory', 'board', 'final'];
const GRADE_TYPE_NAMES = {
  control: 'контрольная',
  independent: 'самостоятельная',
  laboratory: 'лабораторная',
  board: 'выход к доске',
  final: 'финальная'
};
const LESSON_STATUSES = ['pending', 'open', 'completed'];

module.exports = {
  AppError,
  handle,
  isId,
  isDate,
  today,
  now,
  hoursFromNow,
  fullName,
  placeholders,
  text,
  LESSON_TYPES,
  LESSON_TYPE_NAMES,
  GRADE_TYPES,
  GRADE_TYPE_NAMES,
  LESSON_STATUSES
};
