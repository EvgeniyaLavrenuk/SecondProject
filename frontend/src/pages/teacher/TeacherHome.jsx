import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import http, { errorText } from '../../api/http';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, Loader, StatCard, useLoad } from '../../components/Common';
import ErrorMessage from '../../components/ErrorMessage';
import Modal from '../../components/Modal';
import { useConfirm } from '../../components/ConfirmModal';

// Главная страница преподавателя
function TeacherHome() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad(() => http.get('/teacher/dashboard').then((r) => r.data));
  const [confirmElement, ask] = useConfirm();
  const [editCourse, setEditCourse] = useState(null);
  const [groupsCourse, setGroupsCourse] = useState(null);

  // убрать группу из дисциплины
  const removeGroup = (course, group) => {
    ask({
      title: 'Убрать группу',
      text: `Убрать группу ${group.name} из дисциплины «${course.discipline}»?`,
      details: 'Студенты группы потеряют доступ к занятиям и заданиям курса. Оценки и отметки сохранятся.',
      confirmText: 'Убрать группу',
      danger: true,
      action: async () => {
        await http.put(`/teacher/courses/${course.id}/groups`, {
          groupIds: course.groups.filter((g) => g.id !== group.id).map((g) => g.id)
        });
        reload();
      }
    });
  };

  return (
    <>
      <section className="hero-card teacher-hero">
        <h1 className="hero-title">👋 Добро пожаловать, {user.fullName}!</h1>
        <p className="hero-text">Управление расписанием ваших дисциплин</p>
        <Link to="/teacher/disciplines" className="btn btn-accent btn-large">🎓 Выбрать дисциплины</Link>
      </section>

      {loading && !data && <Loader />}
      {error && <ErrorMessage text={errorText(error)} onRetry={reload} />}

      {data && (
        <>
          <div className="stats-grid five">
            <StatCard icon="📘" value={data.totals.courses} label="Дисциплин" color="purple" />
            <StatCard icon="👥" value={data.totals.groups} label="Групп" color="blue" />
            <StatCard icon="🎓" value={data.totals.students} label="Студентов" color="green" />
            <StatCard icon="📅" value={data.totals.weekLessons} label="Занятий на этой неделе" color="orange" />
            <StatCard icon="💬" value={data.totals.unreadMessages} label="Непрочитанных сообщений" color="red" />
          </div>

          <h2 className="section-title">📘 Мои дисциплины</h2>
          {data.courses.length === 0 ? (
            <EmptyState icon="🎓" title="Дисциплины не выбраны" text="Выберите дисциплины, которые вы ведете, - после этого можно будет добавить к ним группы, занятия и задания.">
              <Link to="/teacher/disciplines" className="btn btn-primary">Выбрать дисциплины</Link>
            </EmptyState>
          ) : (
            <div className="discipline-grid">
              {data.courses.map((course) => (
                <div key={course.id} className="discipline-card">
                  <div className="discipline-card-head">
                    <h3>{course.discipline}</h3>
                    <button type="button" className="icon-btn" title="Изменить название и описание" onClick={() => setEditCourse(course)}>✏️</button>
                  </div>
                  <p className="muted">{course.description || 'Описание не добавлено.'}</p>

                  <div className="mini-stats">
                    <span>🧩 {course.modulesCount} мод.</span>
                    <span>📖 {course.lessonsCount} зан.</span>
                    <span>📝 {course.assignmentsCount} зад.</span>
                    <span>🎓 {course.studentsCount} студ.</span>
                  </div>

                  <div className="small strong">Группы:</div>
                  <div className="chips">
                    {course.groups.length === 0 && <span className="muted small">группы не добавлены</span>}
                    {course.groups.map((group) => (
                      <span key={group.id} className="chip chip-removable">
                        👥 {group.name} <span className="muted">({group.students})</span>
                        <button type="button" title="Убрать группу" onClick={() => removeGroup(course, group)}>✕</button>
                      </span>
                    ))}
                  </div>

                  <div className="discipline-actions">
                    <button type="button" className="btn btn-light btn-small" onClick={() => setGroupsCourse(course)}>➕ Добавить группу</button>
                    <Link to={`/teacher/lessons?course=${course.id}`} className="btn btn-primary btn-small">📚 Занятия</Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.groups.length > 0 && (
            <>
              <h2 className="section-title">👥 Статистика по группам</h2>
              <div className="card table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Группа</th>
                      <th>Студентов</th>
                      <th>Ваши дисциплины у группы</th>
                      <th>Средний финальный балл</th>
                      <th>Посещаемость</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.groups.map((group) => (
                      <tr key={group.id}>
                        <td className="strong">{group.name}</td>
                        <td>{group.students}</td>
                        <td>{group.courses.join(', ')}</td>
                        <td>{group.averageFinal ?? <span className="muted">нет оценок</span>}</td>
                        <td>
                          {group.attendancePercent === null ? <span className="muted">нет отметок</span> : (
                            <div className="inline-progress">
                              <div className="progress"><div className="progress-bar" style={{ width: `${group.attendancePercent}%` }} /></div>
                              <span>{group.attendancePercent}%</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <EditCourseModal course={editCourse} onClose={() => setEditCourse(null)} ask={ask} onSaved={reload} />
      <GroupsModal course={groupsCourse} onClose={() => setGroupsCourse(null)} ask={ask} onSaved={reload} />
      {confirmElement}
    </>
  );
}

// изменение названия и описания дисциплины
export function EditCourseModal({ course, onClose, ask, onSaved }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [lastId, setLastId] = useState(null);

  if (course && course.id !== lastId) {
    setLastId(course.id);
    setName(course.discipline);
    setDescription(course.description || '');
    setError('');
  }

  const close = () => {
    setLastId(null);
    onClose();
  };

  const save = (event) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Введите название дисциплины');
      return;
    }
    setError('');
    ask({
      title: 'Сохранение изменений',
      text: `Сохранить изменения дисциплины «${name.trim()}»?`,
      confirmText: 'Сохранить',
      action: async () => {
        await http.put(`/teacher/courses/${course.id}`, { name, description });
        close();
        onSaved();
      }
    });
  };

  return (
    <Modal
      open={!!course}
      title="✏️ Дисциплина"
      onClose={close}
      footer={
        <>
          <button type="button" className="btn btn-light" onClick={close}>Отмена</button>
          <button type="submit" form="edit-course-form" className="btn btn-primary">Сохранить</button>
        </>
      }
    >
      <form id="edit-course-form" className="form" onSubmit={save}>
        <label>
          Название
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={course && !course.canRename} maxLength={255} />
          {course && !course.canRename && (
            <span className="muted small">Эту дисциплину ведут и другие преподаватели, поэтому ее название изменить нельзя.</span>
          )}
        </label>
        <label>
          Описание курса
          <textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="О чем курс, чему научатся студенты" />
        </label>
        <ErrorMessage text={error} />
      </form>
    </Modal>
  );
}

// выбор групп дисциплины
function GroupsModal({ course, onClose, ask, onSaved }) {
  const [groups, setGroups] = useState([]);
  const [checked, setChecked] = useState([]);
  const [error, setError] = useState('');
  const [lastId, setLastId] = useState(null);

  if (course && course.id !== lastId) {
    setLastId(course.id);
    setChecked(course.groups.map((g) => g.id));
    setError('');
  }

  // список всех групп загружается при открытии окна
  const courseId = course?.id;
  useEffect(() => {
    if (!courseId) return;
    http.get('/teacher/groups')
      .then((response) => setGroups(response.data.groups))
      .catch((err) => setError(errorText(err)));
  }, [courseId]);

  const close = () => {
    setLastId(null);
    onClose();
  };

  const toggle = (id) => setChecked(checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id]);

  const save = () => {
    const before = course.groups.map((g) => g.id);
    const added = groups.filter((g) => checked.includes(g.id) && !before.includes(g.id)).map((g) => g.name);
    const removed = groups.filter((g) => !checked.includes(g.id) && before.includes(g.id)).map((g) => g.name);
    if (added.length === 0 && removed.length === 0) {
      setError('Изменений нет');
      return;
    }
    ask({
      title: 'Группы дисциплины',
      text: `Сохранить группы дисциплины «${course.discipline}»?`,
      details: [
        added.length ? `Будут добавлены: ${added.join(', ')}.` : '',
        removed.length ? `Будут убраны: ${removed.join(', ')} (студенты потеряют доступ к занятиям и заданиям курса).` : ''
      ].join(' '),
      confirmText: 'Сохранить',
      danger: removed.length > 0,
      action: async () => {
        await http.put(`/teacher/courses/${course.id}/groups`, { groupIds: checked });
        close();
        onSaved();
      }
    });
  };

  return (
    <Modal
      open={!!course}
      title={`👥 Группы: ${course?.discipline || ''}`}
      onClose={close}
      footer={
        <>
          <button type="button" className="btn btn-light" onClick={close}>Отмена</button>
          <button type="button" className="btn btn-primary" onClick={save}>Сохранить</button>
        </>
      }
    >
      <p className="muted">Отметьте группы, которые изучают эту дисциплину. Студенты группы увидят курс у себя в кабинете.</p>
      <div className="check-list">
        {groups.map((group) => (
          <label key={group.id} className={`check-item ${checked.includes(group.id) ? 'checked' : ''}`}>
            <input type="checkbox" checked={checked.includes(group.id)} onChange={() => toggle(group.id)} />
            <span className="strong">{group.name}</span>
            <span className="muted small">{group.students} студ.</span>
          </label>
        ))}
      </div>
      <ErrorMessage text={error} />
    </Modal>
  );
}

export default TeacherHome;
