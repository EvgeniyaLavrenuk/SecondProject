import { useState } from 'react';
import http, { errorText } from '../../api/http';
import { Loader, PageTitle, useLoad } from '../../components/Common';
import ErrorMessage from '../../components/ErrorMessage';
import WeekNav from '../../components/WeekNav';
import { LESSON_STATUSES, LESSON_TYPES, TIME_SLOTS } from '../../utils/constants';
import { DAY_SHORT, addDays, formatDayMonth, mondayOf, toISO, todayISO } from '../../utils/dates';

// Расписание преподавателя: занятия из раздела «Занятия» по дням недели
function TeacherSchedule() {
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [courseId, setCourseId] = useState('');
  const [groupId, setGroupId] = useState('');

  const coursesState = useLoad(() => http.get('/teacher/dashboard').then((r) => r.data.courses));
  const from = toISO(monday);
  const to = toISO(addDays(monday, 6));
  const { data, error, loading, reload } = useLoad(
    () => http.get('/teacher/schedule', { params: { from, to, courseId: courseId || undefined, groupId: groupId || undefined } }).then((r) => r.data.lessons),
    [from, courseId, groupId]
  );

  // группы для фильтра: группы выбранной дисциплины или всех дисциплин
  const courses = coursesState.data || [];
  const groups = [];
  courses
    .filter((c) => !courseId || c.id === Number(courseId))
    .forEach((c) => c.groups.forEach((g) => {
      if (!groups.some((x) => x.id === g.id)) groups.push(g);
    }));

  const days = DAY_SHORT.map((name, index) => {
    const date = addDays(monday, index);
    const iso = toISO(date);
    return { name, date, iso, lessons: (data || []).filter((l) => l.date === iso) };
  });

  return (
    <>
      <PageTitle icon="📅" title="Расписание" subtitle="Ваши занятия по дням недели" />

      <div className="filters card">
        <label>
          Дисциплина
          <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setGroupId(''); }}>
            <option value="">Все дисциплины</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.discipline}</option>)}
          </select>
        </label>
        <label>
          Группа
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Все группы</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      </div>
      <ErrorMessage text={coursesState.error ? errorText(coursesState.error) : ''} onRetry={coursesState.reload} />

      <WeekNav monday={monday} onChange={setMonday} />

      {error && <ErrorMessage text={errorText(error)} onRetry={reload} />}
      {loading && !data && <Loader />}

      <div className="week-grid">
        {days.map((day) => (
          <div key={day.iso} className={`week-day ${day.iso === todayISO() ? 'today' : ''}`}>
            <div className="week-day-head">
              <span className="strong">{day.name}</span>
              <span className="muted small">{formatDayMonth(day.date)}</span>
            </div>
            <div className="week-day-body">
              {day.lessons.map((lesson) => (
                <div
                  key={lesson.id}
                  className="week-lesson"
                  style={{ borderLeftColor: LESSON_TYPES[lesson.type]?.color, background: `${LESSON_TYPES[lesson.type]?.color}14` }}
                >
                  <div className="week-lesson-time">{lesson.slot} пара · {TIME_SLOTS[lesson.slot]}</div>
                  <div className="strong">{lesson.discipline}</div>
                  <div className="small">{lesson.title}</div>
                  <div className="small muted">🚪 ауд. {lesson.room}</div>
                  <div className="small muted">👥 {lesson.groups.map((g) => g.name).join(', ') || '-'}</div>
                  <div className="week-lesson-foot">
                    <span className="small" style={{ color: LESSON_TYPES[lesson.type]?.color }}>● {LESSON_TYPES[lesson.type]?.name}</span>
                    <span className="small muted" title={LESSON_STATUSES[lesson.status].name}>{LESSON_STATUSES[lesson.status].icon}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="type-legend">
        {Object.entries(LESSON_TYPES).map(([key, info]) => (
          <span key={key}><span className="type-dot" style={{ background: info.color }} />{info.name}</span>
        ))}
      </div>
    </>
  );
}

export default TeacherSchedule;
