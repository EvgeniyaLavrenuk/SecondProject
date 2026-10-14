import { addDays, formatDayMonth, mondayOf, weekInfo } from '../utils/dates';

// Переключатель недель: ← Прошлая неделя | Текущая неделя | Следующая неделя →
function WeekNav({ monday, onChange }) {
  const info = weekInfo(monday);
  const current = mondayOf(new Date()).getTime() === monday.getTime();

  return (
    <div className="week-nav">
      <div className="week-nav-buttons">
        <button type="button" className="btn btn-light" onClick={() => onChange(addDays(monday, -7))}>← Прошлая неделя</button>
        <button type="button" className={`btn ${current ? 'btn-primary' : 'btn-light'}`} onClick={() => onChange(mondayOf(new Date()))}>
          Текущая неделя
        </button>
        <button type="button" className="btn btn-light" onClick={() => onChange(addDays(monday, 7))}>Следующая неделя →</button>
      </div>
      <div className="week-nav-info">
        <span className="week-range">{formatDayMonth(monday)} - {formatDayMonth(addDays(monday, 6))}</span>
        <span className={`week-parity ${info.upper ? 'upper' : 'lower'}`}>
          {info.upper ? '⬆️' : '⬇️'} {info.name} · {info.number}-я учебная
        </span>
      </div>
    </div>
  );
}

export default WeekNav;
