// ===== Работа с датами =====

const pad = (n) => String(n).padStart(2, '0');

export const DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
export const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// Date -> 'ГГГГ-ММ-ДД' (по местному времени)
export const toISO = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// 'ГГГГ-ММ-ДД' -> Date
export const fromISO = (value) => {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayISO = () => toISO(new Date());

export const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

// понедельник недели, в которую входит дата
export const mondayOf = (date) => addDays(date, -((date.getDay() + 6) % 7));

// '2026-10-14' -> '14.10.2026'
export const formatDate = (value) => {
  if (!value) return '';
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};

// '2026-10-14 12:30:00' -> '14.10.2026 12:30'
export const formatDateTime = (value) => {
  if (!value) return '';
  return `${formatDate(value)} ${value.slice(11, 16)}`;
};

// '14 октября'
export const formatDayMonth = (date) => `${date.getDate()} ${MONTHS[date.getMonth()]}`;

// номер учебной недели и ее тип: недели считаются от недели с 1 сентября,
// нечетная неделя - верхняя, четная - нижняя
export const weekInfo = (monday) => {
  const year = monday.getMonth() >= 7 ? monday.getFullYear() : monday.getFullYear() - 1;
  const start = mondayOf(new Date(year, 8, 1));
  const number = Math.floor(Math.round((monday - start) / 86400000) / 7) + 1;
  return { number, upper: number % 2 === 1, name: number % 2 === 1 ? 'Верхняя неделя' : 'Нижняя неделя' };
};

// '2026-10-14 12:30:00' -> время для списка сообщений
export const shortDateTime = (value) => {
  if (!value) return '';
  if (value.slice(0, 10) === todayISO()) return `сегодня, ${value.slice(11, 16)}`;
  return `${formatDate(value)}, ${value.slice(11, 16)}`;
};
