import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import http, { errorText } from '../../api/http';
import { EmptyState, Loader, PageTitle, TypeBadge, useLoad } from '../../components/Common';
import ErrorMessage from '../../components/ErrorMessage';
import Modal from '../../components/Modal';
import { useConfirm } from '../../components/ConfirmModal';
import { GRADE_TYPES, GRADE_TYPE_ONE, LESSON_TYPES, TIME_SLOTS } from '../../utils/constants';
import { formatDate, todayISO } from '../../utils/dates';

const TYPES = ['control', 'independent', 'laboratory', 'board'];
const gradeClass = (value) => (value >= 5 ? 'g5' : value === 4 ? 'g4' : value === 3 ? 'g3' : 'g2');

// Оценки: журнал оценок и посещаемости по группе
function TeacherGrades() {
  const groupsState = useLoad(() => http.get('/teacher/journal-groups').then((r) => r.data.groups));
  const groups = groupsState.data;
  const [groupId, setGroupId] = useState(null);
  const [courseId, setCourseId] = useState(null);
  const [chooseOpen, setChooseOpen] = useState(false);

  // при входе на страницу открывается окно выбора группы
  useEffect(() => {
    if (groups && groups.length > 0 && !groupId) setChooseOpen(true);
  }, [groups, groupId]);

  const group = groups?.find((g) => g.id === groupId);

  const chooseGroup = (id) => {
    const next = groups.find((g) => g.id === id);
    setGroupId(id);
    // дисциплина сохраняется, если она есть и у новой группы
    if (!next.courses.some((c) => c.id === courseId)) setCourseId(next.courses[0].id);
    setChooseOpen(false);
  };

  if (groupsState.loading && !groups) return <Loader />;
  if (groupsState.error) return <ErrorMessage text={errorText(groupsState.error)} onRetry={groupsState.reload} />;

  return (
    <>
      <PageTitle icon="⭐" title="Оценки и посещаемость" subtitle="Журнал группы по вашей дисциплине" />

      {groups.length === 0 ? (
        <EmptyState icon="👥" title="Нет групп" text="Добавьте группы к своим дисциплинам на главной странице - после этого появится журнал.">
          <Link to="/teacher" className="btn btn-primary">На главную</Link>
        </EmptyState>
      ) : (
        <>
          <div className="group-switch card">
            <div className="field">
              <span className="field-label">Группа</span>
              <div className="pill-row">
                {groups.map((g) => (
                  <button key={g.id} type="button" className={`pill ${g.id === groupId ? 'active' : ''}`} onClick={() => chooseGroup(g.id)}>
                    👥 {g.name}
                  </button>
                ))}
              </div>
            </div>
            {group && (
              <label className="course-select">
                Дисциплина
                <select value={courseId || ''} onChange={(e) => setCourseId(Number(e.target.value))}>
                  {group.courses.map((c) => <option key={c.id} value={c.id}>{c.discipline}</option>)}
                </select>
              </label>
            )}
          </div>

          {group && courseId ? (
            <Journal key={`${groupId}-${courseId}`} groupId={groupId} courseId={courseId} />
          ) : (
            <EmptyState icon="👆" title="Выберите группу" text="Журнал откроется после выбора группы.">
              <button type="button" className="btn btn-primary" onClick={() => setChooseOpen(true)}>Выбрать группу</button>
            </EmptyState>
          )}
        </>
      )}

      <Modal open={chooseOpen} title="👥 Выбор группы" onClose={() => setChooseOpen(false)}>
        <div className="choose-list">
          {(groups || []).map((g) => (
            <button key={g.id} type="button" className={`choose-item ${g.id === groupId ? 'active' : ''}`} onClick={() => chooseGroup(g.id)}>
              <div className="strong">{g.name}</div>
              <div className="muted small">{g.students} студ. · {g.courses.map((c) => c.discipline).join(', ')}</div>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}

// журнал одной группы по одной дисциплине
function Journal({ groupId, courseId }) {
  const { data, error, loading, reload } = useLoad(
    () => http.get('/teacher/journal', { params: { groupId, courseId } }).then((r) => r.data),
    [groupId, courseId]
  );
  const [confirmElement, ask] = useConfirm();
  const [tab, setTab] = useState('grades');
  const [gradeFor, setGradeFor] = useState(null);

  if (loading && !data) return <Loader />;
  if (error) return <ErrorMessage text={errorText(error)} onRetry={reload} />;

  const deleteGrade = (student, grade) => ask({
    title: 'Удаление оценки',
    text: `Удалить оценку ${grade.value} (${GRADE_TYPE_ONE[grade.type].toLowerCase()}) у студента ${student.name}?`,
    details: `Дата: ${formatDate(grade.date)}`,
    confirmText: 'Удалить',
    danger: true,
    action: async () => {
      await http.delete(`/teacher/grades/${grade.id}`);
      reload();
    }
  });

  return (
    <>
      <div className="tabs">
        <button type="button" className={tab === 'grades' ? 'active' : ''} onClick={() => setTab('grades')}>⭐ Журнал оценок</button>
        <button type="button" className={tab === 'attendance' ? 'active' : ''} onClick={() => setTab('attendance')}>✔️ Посещаемость</button>
      </div>

      {data.students.length === 0 && <EmptyState icon="🎓" title="В группе нет студентов" />}

      {tab === 'grades' && data.students.length > 0 && (
        <div className="card table-wrap">
          <table className="table journal">
            <thead>
              <tr>
                <th>Студент</th>
                {TYPES.map((type) => <th key={type}>{GRADE_TYPES[type]}</th>)}
                <th>Финальная</th>
                <th>Посещаемость</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.students.map((student) => {
                const grades = data.grades.filter((g) => g.studentId === student.id);
                const final = grades.find((g) => g.type === 'final');
                return (
                  <tr key={student.id}>
                    <td className="strong nowrap">{student.name}</td>
                    {TYPES.map((type) => (
                      <td key={type}>
                        {grades.filter((g) => g.type === type).map((grade) => (
                          <button
                            key={grade.id}
                            type="button"
                            className={`grade-pill ${gradeClass(grade.value)} removable`}
                            title={`${formatDate(grade.date)}${grade.comment ? ` - ${grade.comment}` : ''}. Нажмите, чтобы удалить`}
                            onClick={() => deleteGrade(student, grade)}
                          >
                            {grade.value}
                          </button>
                        ))}
                      </td>
                    ))}
                    <td>
                      {final ? (
                        <button type="button" className={`grade-pill big ${gradeClass(final.value)} removable`} title="Нажмите, чтобы удалить" onClick={() => deleteGrade(student, final)}>
                          {final.value}
                        </button>
                      ) : <span className="muted">-</span>}
                    </td>
                    <td>{student.attendance.percent === null ? <span className="muted">-</span> : `${student.attendance.percent}% (${student.attendance.present}/${student.attendance.total})`}</td>
                    <td>
                      <button type="button" className="btn btn-primary btn-small nowrap" onClick={() => setGradeFor(student)}>➕ Оценка</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small hint">Чтобы удалить оценку, нажмите на нее. Финальная оценка у студента одна - новая заменяет прежнюю.</p>
        </div>
      )}

      {tab === 'attendance' && data.students.length > 0 && (
        <Attendance data={data} ask={ask} onSaved={reload} />
      )}

      <GradeModal student={gradeFor} courseId={courseId} discipline={data.course.discipline} ask={ask} onClose={() => setGradeFor(null)} onSaved={reload} />
      {confirmElement}
    </>
  );
}

// отметки посещаемости по занятию
function Attendance({ data, ask, onSaved }) {
  // отмечать можно только прошедшие и сегодняшние занятия
  const lessons = data.lessons.filter((l) => l.date <= todayISO());
  const [lessonId, setLessonId] = useState(lessons[lessons.length - 1]?.id || null);
  const [marks, setMarks] = useState({});
  const [error, setError] = useState('');

  // при выборе занятия подставляются уже сохраненные отметки (по умолчанию - присутствовал)
  useEffect(() => {
    const next = {};
    data.students.forEach((s) => {
      const saved = data.attendance.find((a) => a.lessonId === lessonId && a.studentId === s.id);
      next[s.id] = saved ? saved.present : true;
    });
    setMarks(next);
    setError('');
  }, [lessonId, data]);

  if (lessons.length === 0) {
    return <EmptyState icon="📅" title="Прошедших занятий нет" text="Посещаемость отмечается в день занятия или позже. Будущие занятия появятся здесь, когда пройдут." />;
  }

  const lesson = lessons.find((l) => l.id === lessonId);
  const markedBefore = data.attendance.some((a) => a.lessonId === lessonId);

  const save = () => {
    const present = Object.values(marks).filter(Boolean).length;
    setError('');
    ask({
      title: 'Сохранение посещаемости',
      text: `Сохранить отметки за занятие «${lesson.title}» (${formatDate(lesson.date)})?`,
      details: `Присутствуют: ${present} из ${data.students.length}.`,
      confirmText: 'Сохранить',
      action: async () => {
        await http.put('/teacher/attendance', {
          lessonId,
          marks: data.students.map((s) => ({ studentId: s.id, present: marks[s.id] }))
        });
        onSaved();
      }
    });
  };

  return (
    <div className="card">
      <label className="field">
        <span className="field-label">Занятие</span>
        <select value={lessonId || ''} onChange={(e) => setLessonId(Number(e.target.value))}>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {formatDate(l.date)} · {l.slot} пара · {l.title}{data.attendance.some((a) => a.lessonId === l.id) ? ' ✔' : ''}
            </option>
          ))}
        </select>
      </label>
      {lesson && (
        <div className="muted small attendance-lesson">
          <TypeBadge type={lesson.type} types={LESSON_TYPES} /> {TIME_SLOTS[lesson.slot]} · {markedBefore ? 'отметки уже сохранены' : 'отметки еще не ставились'}
        </div>
      )}

      <div className="attendance-grid">
        {data.students.map((s) => (
          <div key={s.id} className={`attendance-row ${marks[s.id] ? 'present' : 'absent'}`}>
            <span className="strong">{s.name}</span>
            <div className="toggle-group">
              <button type="button" className={marks[s.id] ? 'on' : ''} onClick={() => setMarks({ ...marks, [s.id]: true })}>✔ Был</button>
              <button type="button" className={!marks[s.id] ? 'on off' : ''} onClick={() => setMarks({ ...marks, [s.id]: false })}>✖ Не был</button>
            </div>
          </div>
        ))}
      </div>
      <ErrorMessage text={error} />
      <div className="right">
        <button type="button" className="btn btn-primary" onClick={save}>💾 Сохранить посещаемость</button>
      </div>
    </div>
  );
}

// выставление оценки
function GradeModal({ student, courseId, discipline, ask, onClose, onSaved }) {
  const [type, setType] = useState('control');
  const [value, setValue] = useState(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (student) {
      setType('control');
      setValue(null);
      setComment('');
      setError('');
    }
  }, [student]);

  const save = (event) => {
    event.preventDefault();
    if (!value) {
      setError('Выберите оценку');
      return;
    }
    setError('');
    ask({
      title: 'Выставление оценки',
      text: `Поставить оценку ${value} (${GRADE_TYPE_ONE[type].toLowerCase()}) студенту ${student.name}?`,
      details: type === 'final' ? 'Финальная оценка заменит ранее выставленную финальную (если она была).' : `Дисциплина: ${discipline}`,
      confirmText: 'Поставить',
      action: async () => {
        await http.post('/teacher/grades', { courseId, studentId: student.id, type, value, comment });
        onClose();
        onSaved();
      }
    });
  };

  return (
    <Modal
      open={!!student}
      title={`⭐ Оценка: ${student?.name || ''}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-light" onClick={onClose}>Отмена</button>
          <button type="submit" form="grade-form" className="btn btn-primary">Поставить</button>
        </>
      }
    >
      <form id="grade-form" className="form" onSubmit={save}>
        <label>
          Вид работы
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(GRADE_TYPE_ONE).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
        </label>
        <div className="field">
          <span className="field-label">Оценка</span>
          <div className="grade-picker">
            {[5, 4, 3, 2, 1].map((v) => (
              <button key={v} type="button" className={`grade-pill big ${gradeClass(v)} ${value === v ? 'selected' : ''}`} onClick={() => setValue(v)}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <label>Комментарий (необязательно)<input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={255} /></label>
        <ErrorMessage text={error} />
      </form>
    </Modal>
  );
}

export default TeacherGrades;
