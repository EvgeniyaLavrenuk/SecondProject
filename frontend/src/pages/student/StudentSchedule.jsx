import { useState } from 'react';
import http, { errorText } from '../../api/http';
import { Loader, PageTitle, StatCard, TypeBadge, useLoad } from '../../components/Common';
import ErrorMessage from '../../components/ErrorMessage';
import WeekNav from '../../components/WeekNav';
import { LESSON_TYPES, TIME_SLOTS } from '../../utils/constants';
import { DAY_NAMES, addDays, formatDayMonth, mondayOf, toISO, todayISO } from '../../utils/dates';

// Расписание группы студента на неделю
function StudentSchedule() {
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [selected, setSelected] = useState(() => todayISO());

  const from = toISO(monday);
  const to = toISO(addDays(monday, 6));
  const { data, error, loading, reload } = useLoad(
    () => http.get('/student/schedule', { params: { from, to } }).then((r) => r.data.lessons),
    [from]
  );

  const days = DAY_NAMES.map((name, index) => {
    const date = addDays(monday, index);
    const iso = toISO(date);
    return { name, date, iso, lessons: (data || []).filter((l) => l.date === iso) };
  });

  // при смене недели выбирается сегодняшний день (если он в этой неделе) или понедельник
  const changeWeek = (newMonday) => {
    setMonday(newMonday);
    const today = todayISO();
    const inWeek = today >= toISO(newMonday) && today <= toISO(addDays(newMonday, 6));
    setSelected(inWeek ? today : toISO(newMonday));
  };

  const day = days.find((d) => d.iso === selected) || days[0];
  const todayLessons = (data || []).filter((l) => l.date === todayISO()).length;

  return (
    <>
      <PageTitle icon="📅" title="Расписание" subtitle="Занятия вашей группы, назначенные преподавателями" />
      <WeekNav monday={monday} onChange={changeWeek} />

      <div className="stats-grid">
        <StatCard icon="📚" value={data ? data.length : '…'} label="Пар на этой неделе" color="purple" />
        <StatCard icon="🕐" value={data ? todayLessons : '…'} label="Пар сегодня" color="green" />
      </div>

      {error && <ErrorMessage text={errorText(error)} onRetry={reload} />}
      {loading && !data && <Loader />}

      {data && (
        <div className="schedule-layout">
          <div className="day-list">
            {days.map((d) => (
              <button
                key={d.iso}
                type="button"
                className={`day-item ${d.iso === day.iso ? 'active' : ''} ${d.iso === todayISO() ? 'today' : ''}`}
                onClick={() => setSelected(d.iso)}
              >
                <div>
                  <div className="day-name">{d.name}</div>
                  <div className="day-date">{formatDayMonth(d.date)}{d.iso === todayISO() ? ' · сегодня' : ''}</div>
                </div>
                <span className={`day-count ${d.lessons.length === 0 ? 'free' : ''}`}>
                  {d.lessons.length === 0 ? 'выходной' : `${d.lessons.length} пар.`}
                </span>
              </button>
            ))}
          </div>

          <div className="day-panel card">
            <h2 className="card-title">{day.name}, {formatDayMonth(day.date)}</h2>
            {day.lessons.length === 0 ? (
              <div className="free-day">
                <div className="free-day-icon">🌿</div>
                <h3>Сегодня нет занятий!</h3>
                <p>Хороший день для самостоятельной работы</p>
              </div>
            ) : (
              <div className="schedule-lessons">
                {day.lessons.map((lesson) => (
                  <div key={lesson.id} className="schedule-lesson" style={{ borderLeftColor: LESSON_TYPES[lesson.type]?.color }}>
                    <div className="schedule-time">
                      <div className="pair-number">{lesson.slot} пара</div>
                      <div>{TIME_SLOTS[lesson.slot]}</div>
                    </div>
                    <div className="schedule-info">
                      <div className="strong">{lesson.discipline}</div>
                      <div className="muted">{lesson.title}</div>
                      <div className="small">👨‍🏫 {lesson.teacher} · 🚪 ауд. {lesson.room}</div>
                    </div>
                    <TypeBadge type={lesson.type} types={LESSON_TYPES} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="type-legend">
        {Object.entries(LESSON_TYPES).map(([key, info]) => (
          <span key={key}><span className="type-dot" style={{ background: info.color }} />{info.name}</span>
        ))}
      </div>
    </>
  );
}

export default StudentSchedule;
