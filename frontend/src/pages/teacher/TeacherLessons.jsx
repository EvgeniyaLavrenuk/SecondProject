import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import http, { errorText } from '../../api/http';
import { EmptyState, Loader, StatCard, TypeBadge, useLoad } from '../../components/Common';
import ErrorMessage from '../../components/ErrorMessage';
import Modal from '../../components/Modal';
import { useConfirm } from '../../components/ConfirmModal';
import { FileLink, FilePicker } from '../../components/Files';
import { EditCourseModal } from './TeacherHome';
import { LESSON_STATUSES, LESSON_TYPES, TIME_SLOTS } from '../../utils/constants';
import { formatDate, formatDateTime, todayISO } from '../../utils/dates';

const LAST_COURSE_KEY = 'zachio_last_course';

// Занятия: модули, занятия и задания выбранной дисциплины
function TeacherLessons() {
  const [params, setParams] = useSearchParams();
  const coursesState = useLoad(() => http.get('/teacher/dashboard').then((r) => r.data.courses));
  const courses = coursesState.data;
  const [chooseOpen, setChooseOpen] = useState(false);

  // выбранная дисциплина: из адреса страницы или последняя открытая
  let courseId = Number(params.get('course')) || null;
  if (!courseId && courses) {
    let saved = null;
    try {
      saved = Number(localStorage.getItem(LAST_COURSE_KEY));
    } catch {
      saved = null;
    }
    if (courses.some((c) => c.id === saved)) courseId = saved;
  }
  const courseExists = courses?.some((c) => c.id === courseId);

  useEffect(() => {
    if (courses && courses.length > 0 && !courseExists) setChooseOpen(true);
  }, [courses, courseExists]);

  const choose = (id) => {
    try {
      localStorage.setItem(LAST_COURSE_KEY, String(id));
    } catch {
      // без сохранения выбора страница тоже работает
    }
    setParams({ course: String(id) });
    setChooseOpen(false);
  };

  if (coursesState.loading && !courses) return <Loader />;
  if (coursesState.error) return <ErrorMessage text={errorText(coursesState.error)} onRetry={coursesState.reload} />;

  if (courses.length === 0) {
    return (
      <EmptyState icon="🎓" title="Сначала выберите дисциплины" text="Занятия добавляются к дисциплинам, которые вы ведете.">
        <Link to="/teacher/disciplines" className="btn btn-primary">Перейти к дисциплинам</Link>
      </EmptyState>
    );
  }

  return (
    <>
      {courseExists ? (
        <CourseWorkspace key={courseId} courseId={courseId} onChange={() => setChooseOpen(true)} />
      ) : (
        <EmptyState icon="📘" title="Дисциплина не выбрана" text="Выберите дисциплину, с которой будете работать.">
          <button type="button" className="btn btn-primary" onClick={() => setChooseOpen(true)}>Выбрать дисциплину</button>
        </EmptyState>
      )}

      <Modal open={chooseOpen} title="📘 Выбор дисциплины" onClose={() => setChooseOpen(false)}>
        <div className="choose-list">
          {courses.map((course) => (
            <button
              key={course.id}
              type="button"
              className={`choose-item ${course.id === courseId ? 'active' : ''}`}
              onClick={() => choose(course.id)}
            >
              <div className="strong">{course.discipline}</div>
              <div className="muted small">
                {course.groups.length ? `Группы: ${course.groups.map((g) => g.name).join(', ')}` : 'Группы не добавлены'} · {course.lessonsCount} зан.
              </div>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}

// рабочая область одной дисциплины
function CourseWorkspace({ courseId, onChange }) {
  const { data, error, loading, reload } = useLoad(() => http.get(`/teacher/courses/${courseId}`).then((r) => r.data), [courseId]);
  const [confirmElement, ask] = useConfirm();
  const [moduleModal, setModuleModal] = useState(null); // { id?, name }
  const [lessonOpen, setLessonOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deadlineFor, setDeadlineFor] = useState(null);
  const [submissionsFor, setSubmissionsFor] = useState(null);
  const [lessonDetails, setLessonDetails] = useState(null);

  if (loading && !data) return <Loader />;
  if (error) return <ErrorMessage text={errorText(error)} onRetry={reload} />;

  const { course, groups, stats, modules, lessons, assignments } = data;

  const deleteModule = (module) => ask({
    title: 'Удаление модуля',
    text: `Удалить модуль «${module.name}»?`,
    details: 'Все занятия модуля, их материалы и отметки посещаемости тоже будут удалены.',
    confirmText: 'Удалить',
    danger: true,
    action: async () => {
      await http.delete(`/teacher/modules/${module.id}`);
      reload();
    }
  });

  const STATUS_ACTIONS = {
    open: { label: '▶️ Открыть', text: 'Открыть занятие? Студенты увидят темы и материалы.' },
    pending: { label: '🔒 Закрыть', text: 'Закрыть занятие? Материалы станут недоступны студентам.' },
    completed: { label: '✅ Завершить', text: 'Отметить занятие как завершенное?' }
  };

  const changeStatus = (lesson, status) => ask({
    title: 'Статус занятия',
    text: `${STATUS_ACTIONS[status].text}`,
    details: `Занятие: «${lesson.title}»`,
    confirmText: 'Подтвердить',
    action: async () => {
      await http.put(`/teacher/lessons/${lesson.id}/status`, { status });
      reload();
    }
  });

  const deleteLesson = (lesson) => ask({
    title: 'Удаление занятия',
    text: `Удалить занятие «${lesson.title}»?`,
    details: 'Занятие пропадет из расписания групп, вместе с ним удалятся материалы и отметки посещаемости.',
    confirmText: 'Удалить',
    danger: true,
    action: async () => {
      await http.delete(`/teacher/lessons/${lesson.id}`);
      setLessonDetails(null);
      reload();
    }
  });

  const deleteAssignment = (assignment) => ask({
    title: 'Удаление задания',
    text: `Удалить задание «${assignment.title}»?`,
    details: assignment.submissions > 0 ? `Отправленные студентами работы (${assignment.submissions}) тоже будут удалены.` : '',
    confirmText: 'Удалить',
    danger: true,
    action: async () => {
      await http.delete(`/teacher/assignments/${assignment.id}`);
      reload();
    }
  });

  // какие действия со статусом доступны
  const statusButtons = (lesson) => {
    if (lesson.status === 'pending') return ['open'];
    // завершить можно только прошедшее или сегодняшнее занятие
    if (lesson.status === 'open') return lesson.date <= todayISO() ? ['completed', 'pending'] : ['pending'];
    return ['open'];
  };

  return (
    <>
      <section className="course-header card">
        <div>
          <div className="muted small">Дисциплина</div>
          <h1>{course.discipline}</h1>
          <p className="muted">{course.description || 'Описание не добавлено - его можно указать в настройках курса.'}</p>
          <div className="chips">
            {groups.length === 0
              ? <span className="muted small">Группы не добавлены (добавляются на главной странице)</span>
              : groups.map((g) => <span key={g.id} className="chip">👥 {g.name}</span>)}
          </div>
        </div>
        <button type="button" className="btn btn-light" onClick={onChange}>🔄 Сменить дисциплину</button>
      </section>

      <div className="stats-grid">
        <StatCard icon="🎓" value={stats.students} label="Студентов под руководством" color="purple" />
        <StatCard icon="📖" value={stats.lessons} label="Занятий" color="green" />
        <StatCard icon="🧩" value={stats.modules} label="Модулей" color="blue" />
      </div>

      <div className="action-bar">
        <button type="button" className="action-btn blue" onClick={() => setModuleModal({ name: '' })}>➕ Добавить модуль</button>
        <button type="button" className="action-btn green" onClick={() => setLessonOpen(true)}>➕ Добавить занятие</button>
        <button type="button" className="action-btn purple" onClick={() => setAssignmentOpen(true)}>➕ Добавить задание</button>
        <button type="button" className="action-btn orange" onClick={() => setSettingsOpen(true)}>⚙️ Настройки курса</button>
      </div>

      <h2 className="section-title">🧩 Модули и занятия</h2>
      {modules.length === 0 && (
        <EmptyState icon="🧩" title="Модулей пока нет" text="Создайте первый модуль, затем добавляйте в него занятия." />
      )}
      {modules.map((module, index) => {
        const moduleLessons = lessons.filter((l) => l.moduleId === module.id);
        return (
          <section key={module.id} className="module-block">
            <div className="module-head">
              <h3 className="module-title"><span className="module-number">{index + 1}</span>{module.name}</h3>
              <div className="module-actions">
                <span className="muted small">{moduleLessons.length} зан.</span>
                <button type="button" className="btn btn-light btn-small" onClick={() => setModuleModal(module)}>✏️ Переименовать</button>
                <button type="button" className="btn btn-danger-light btn-small" onClick={() => deleteModule(module)}>🗑 Удалить</button>
              </div>
            </div>
            {moduleLessons.length === 0 ? (
              <p className="muted">В модуле пока нет занятий.</p>
            ) : (
              <div className="lesson-list">
                {moduleLessons.map((lesson) => (
                  <div key={lesson.id} className={`lesson-row teacher status-${lesson.status}`} style={{ borderLeftColor: LESSON_TYPES[lesson.type]?.color }}>
                    <button type="button" className="lesson-row-main as-link" onClick={() => setLessonDetails(lesson)}>
                      <div className="strong">{lesson.title}</div>
                      <div className="muted small">
                        {formatDate(lesson.date)} · {lesson.slot} пара ({TIME_SLOTS[lesson.slot]}) · ауд. {lesson.room}
                      </div>
                      <div className="small">
                        👥 {lesson.groups.length ? lesson.groups.map((g) => g.name).join(', ') : <span className="danger-text">нет групп</span>}
                        {lesson.files.length > 0 && <> · 📎 {lesson.files.length}</>}
                      </div>
                    </button>
                    <TypeBadge type={lesson.type} types={LESSON_TYPES} />
                    <span className="lesson-status">{LESSON_STATUSES[lesson.status].icon} {LESSON_STATUSES[lesson.status].name}</span>
                    <div className="lesson-buttons">
                      {statusButtons(lesson).map((status) => (
                        <button key={status} type="button" className={`btn btn-small ${status === 'completed' ? 'btn-success' : status === 'open' ? 'btn-primary' : 'btn-gray'}`} onClick={() => changeStatus(lesson, status)}>
                          {STATUS_ACTIONS[status].label}
                        </button>
                      ))}
                      <button type="button" className="icon-btn" title="Удалить занятие" onClick={() => deleteLesson(lesson)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <h2 className="section-title">📝 Задания</h2>
      {assignments.length === 0 ? (
        <EmptyState icon="📝" title="Заданий пока нет" text="Нажмите «Добавить задание», чтобы выдать работу группам." />
      ) : (
        <div className="assignment-grid">
          {assignments.map((assignment) => {
            const expired = assignment.dueDate < todayISO();
            return (
              <div key={assignment.id} className={`assignment-card ${expired ? 'state-expired' : 'state-active'}`}>
                <div className="assignment-top">
                  <span className={`badge ${expired ? 'badge-red' : assignment.startDate > todayISO() ? 'badge-gray' : 'badge-green'}`}>
                    {expired ? 'Срок прошел' : assignment.startDate > todayISO() ? 'Еще не началось' : 'Идет прием работ'}
                  </span>
                  <span className="badge badge-purple">📤 Сдано: {assignment.submissions}</span>
                </div>
                <h3>{assignment.title}</h3>
                <p className="muted clamp">{assignment.description || 'Без описания'}</p>
                <div className="assignment-dates small">
                  <div>📅 {formatDate(assignment.startDate)} - {formatDate(assignment.dueDate)}</div>
                  <div>👥 {assignment.groups.length ? assignment.groups.map((g) => g.name).join(', ') : <span className="danger-text">нет групп</span>}</div>
                </div>
                {assignment.files.length > 0 && (
                  <div className="file-links small">{assignment.files.map((f) => <FileLink key={f.id} file={f} />)}</div>
                )}
                <div className="assignment-actions">
                  <button type="button" className="btn btn-primary btn-small" onClick={() => setSubmissionsFor(assignment)}>📥 Работы студентов</button>
                  <button type="button" className="btn btn-light btn-small" onClick={() => setDeadlineFor(assignment)}>⏰ Изменить срок</button>
                  <button type="button" className="btn btn-danger-light btn-small" onClick={() => deleteAssignment(assignment)}>🗑 Удалить</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* подробности занятия */}
      <Modal open={!!lessonDetails} title={lessonDetails?.title || ''} onClose={() => setLessonDetails(null)}>
        {lessonDetails && (
          <div className="details">
            <div className="details-row"><span>Модуль</span><b>{modules.find((m) => m.id === lessonDetails.moduleId)?.name}</b></div>
            <div className="details-row"><span>Тип</span><TypeBadge type={lessonDetails.type} types={LESSON_TYPES} /></div>
            <div className="details-row"><span>Дата и время</span><b>{formatDate(lessonDetails.date)}, {TIME_SLOTS[lessonDetails.slot]}</b></div>
            <div className="details-row"><span>Аудитория</span><b>{lessonDetails.room}</b></div>
            <div className="details-row"><span>Длительность</span><b>{lessonDetails.duration || '-'}</b></div>
            <div className="details-row"><span>Группы</span><b>{lessonDetails.groups.map((g) => g.name).join(', ') || '-'}</b></div>
            <div className="details-row"><span>Статус</span><b>{LESSON_STATUSES[lessonDetails.status].icon} {LESSON_STATUSES[lessonDetails.status].name}</b></div>
            <h4>Темы</h4>
            <p className="pre">{lessonDetails.topics || 'Не указаны'}</p>
            <h4>Материалы</h4>
            {lessonDetails.files.length === 0 ? <p className="muted">Файлы не прикреплены.</p> : (
              <div className="file-links">{lessonDetails.files.map((f) => <FileLink key={f.id} file={f} />)}</div>
            )}
          </div>
        )}
      </Modal>

      <ModuleModal module={moduleModal} courseId={course.id} ask={ask} onClose={() => setModuleModal(null)} onSaved={reload} />
      <LessonModal open={lessonOpen} course={course} modules={modules} groups={groups} ask={ask} onClose={() => setLessonOpen(false)} onSaved={reload} />
      <AssignmentModal open={assignmentOpen} course={course} groups={groups} ask={ask} onClose={() => setAssignmentOpen(false)} onSaved={reload} />
      <DeadlineModal assignment={deadlineFor} ask={ask} onClose={() => setDeadlineFor(null)} onSaved={reload} />
      <SubmissionsModal assignment={submissionsFor} onClose={() => setSubmissionsFor(null)} />
      <EditCourseModal
        course={settingsOpen ? { ...course, discipline: course.discipline } : null}
        ask={ask}
        onClose={() => setSettingsOpen(false)}
        onSaved={reload}
      />
      {confirmElement}
    </>
  );
}

// добавление / переименование модуля
function ModuleModal({ module, courseId, ask, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (module) {
      setName(module.name || '');
      setError('');
    }
  }, [module]);

  const save = (event) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Введите название модуля');
      return;
    }
    setError('');
    const isNew = !module.id;
    ask({
      title: isNew ? 'Новый модуль' : 'Переименование модуля',
      text: isNew ? `Добавить модуль «${name.trim()}»?` : `Переименовать модуль «${module.name}» в «${name.trim()}»?`,
      confirmText: isNew ? 'Добавить' : 'Сохранить',
      action: async () => {
        if (isNew) await http.post(`/teacher/courses/${courseId}/modules`, { name });
        else await http.put(`/teacher/modules/${module.id}`, { name });
        onClose();
        onSaved();
      }
    });
  };

  return (
    <Modal
      open={!!module}
      title={module?.id ? '✏️ Переименовать модуль' : '➕ Новый модуль'}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-light" onClick={onClose}>Отмена</button>
          <button type="submit" form="module-form" className="btn btn-primary">{module?.id ? 'Сохранить' : 'Добавить'}</button>
        </>
      }
    >
      <form id="module-form" className="form" onSubmit={save}>
        <label>Название модуля<input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} autoFocus /></label>
        <ErrorMessage text={error} />
      </form>
    </Modal>
  );
}

// выбор групп галочками
function GroupChecks({ groups, value, onChange }) {
  if (groups.length === 0) {
    return <div className="info-box">У дисциплины нет групп. Добавьте группы на главной странице.</div>;
  }
  return (
    <div className="chips">
      {groups.map((group) => {
        const checked = value.includes(group.id);
        return (
          <button
            key={group.id}
            type="button"
            className={`chip chip-toggle ${checked ? 'on' : ''}`}
            onClick={() => onChange(checked ? value.filter((id) => id !== group.id) : [...value, group.id])}
          >
            {checked ? '☑' : '☐'} {group.name}
          </button>
        );
      })}
    </div>
  );
}

const EMPTY_LESSON = { moduleId: '', title: '', type: 'lecture', groupIds: [], date: '', slot: '', room: '', topics: '', duration: '1 ч 30 мин' };

// добавление занятия
function LessonModal({ open, course, modules, groups, ask, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_LESSON);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_LESSON, moduleId: modules[0] ? String(modules[0].id) : '', groupIds: groups.map((g) => g.id), date: todayISO() });
      setFiles([]);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  const save = (event) => {
    event.preventDefault();
    if (!form.moduleId) return setError('Сначала создайте модуль');
    if (!form.title.trim()) return setError('Введите название занятия');
    if (form.groupIds.length === 0) return setError('Выберите хотя бы одну группу');
    if (!form.date) return setError('Выберите дату');
    if (!form.slot) return setError('Выберите время занятия');
    if (!form.room.trim()) return setError('Укажите аудиторию');
    setError('');
    ask({
      title: 'Новое занятие',
      text: `Добавить занятие «${form.title.trim()}» на ${formatDate(form.date)}, ${TIME_SLOTS[form.slot]}?`,
      details: 'Занятие появится в расписании выбранных групп. Студенты увидят материалы, когда занятие будет открыто.',
      confirmText: 'Добавить',
      action: async () => {
        await http.post(`/teacher/courses/${course.id}/lessons`, {
          ...form,
          moduleId: Number(form.moduleId),
          slot: Number(form.slot),
          files
        });
        onClose();
        onSaved();
      }
    });
  };

  return (
    <Modal
      open={open}
      title="➕ Новое занятие"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-light" onClick={onClose}>Отмена</button>
          <button type="submit" form="lesson-form" className="btn btn-primary" disabled={modules.length === 0}>Добавить занятие</button>
        </>
      }
    >
      {modules.length === 0 ? (
        <div className="info-box">Сначала создайте хотя бы один модуль - занятия добавляются в модули.</div>
      ) : (
        <form id="lesson-form" className="form" onSubmit={save}>
          <div className="form-row">
            <label>
              Модуль
              <select value={form.moduleId} onChange={set('moduleId')}>
                {modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label>Название занятия<input value={form.title} onChange={set('title')} maxLength={255} /></label>
          </div>

          <div className="field">
            <span className="field-label">Тип занятия</span>
            <div className="type-picker">
              {Object.entries(LESSON_TYPES).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  className={`type-option ${form.type === key ? 'active' : ''}`}
                  style={form.type === key ? { background: info.color, borderColor: info.color, color: '#fff' } : { borderColor: `${info.color}88`, color: info.color }}
                  onClick={() => setForm({ ...form, type: key })}
                >
                  <span className="type-dot" style={{ background: form.type === key ? '#fff' : info.color }} />
                  {info.name}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Группы, которым доступно занятие</span>
            <GroupChecks groups={groups} value={form.groupIds} onChange={(groupIds) => setForm({ ...form, groupIds })} />
          </div>

          <div className="form-row three">
            <label>Дата<input type="date" value={form.date} onChange={set('date')} /></label>
            <label>
              Время
              <select value={form.slot} onChange={set('slot')}>
                <option value="">Выберите пару</option>
                {Object.entries(TIME_SLOTS).map(([slot, time]) => <option key={slot} value={slot}>{slot} пара: {time}</option>)}
              </select>
            </label>
            <label>Аудитория<input value={form.room} onChange={set('room')} maxLength={50} placeholder="например, 305" /></label>
          </div>

          <div className="form-row">
            <label>Темы занятия<textarea rows={3} value={form.topics} onChange={set('topics')} /></label>
            <label>Длительность<input value={form.duration} onChange={set('duration')} maxLength={50} /></label>
          </div>

          <div className="field">
            <span className="field-label">Материалы (студенты смогут их открыть)</span>
            <FilePicker files={files} onChange={setFiles} multiple label="Загрузить материалы" />
          </div>
          <ErrorMessage text={error} />
        </form>
      )}
    </Modal>
  );
}

// добавление задания
function AssignmentModal({ open, course, groups, ask, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', description: '', groupIds: [], startDate: '', dueDate: '' });
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ title: '', description: '', groupIds: groups.map((g) => g.id), startDate: todayISO(), dueDate: '' });
      setFiles([]);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  const save = (event) => {
    event.preventDefault();
    if (!form.title.trim()) return setError('Введите название задания');
    if (form.groupIds.length === 0) return setError('Выберите хотя бы одну группу');
    if (!form.startDate || !form.dueDate) return setError('Укажите даты начала и окончания');
    if (form.startDate < todayISO()) return setError('Дата начала не может быть в прошлом');
    if (form.dueDate < form.startDate) return setError('Срок сдачи не может быть раньше даты начала');
    setError('');
    ask({
      title: 'Новое задание',
      text: `Выдать задание «${form.title.trim()}» со сроком с ${formatDate(form.startDate)} по ${formatDate(form.dueDate)}?`,
      confirmText: 'Добавить',
      action: async () => {
        await http.post(`/teacher/courses/${course.id}/assignments`, { ...form, files });
        onClose();
        onSaved();
      }
    });
  };

  return (
    <Modal
      open={open}
      title="➕ Новое задание"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-light" onClick={onClose}>Отмена</button>
          <button type="submit" form="assignment-form" className="btn btn-primary">Добавить задание</button>
        </>
      }
    >
      <form id="assignment-form" className="form" onSubmit={save}>
        <label>Название<input value={form.title} onChange={set('title')} maxLength={255} /></label>
        <label>Описание<textarea rows={4} value={form.description} onChange={set('description')} /></label>
        <div className="field">
          <span className="field-label">Группы</span>
          <GroupChecks groups={groups} value={form.groupIds} onChange={(groupIds) => setForm({ ...form, groupIds })} />
        </div>
        <div className="form-row">
          <label>Доступно с<input type="date" min={todayISO()} value={form.startDate} onChange={set('startDate')} /></label>
          <label>Срок сдачи<input type="date" min={form.startDate || todayISO()} value={form.dueDate} onChange={set('dueDate')} /></label>
        </div>
        <div className="field">
          <span className="field-label">Файлы задания</span>
          <FilePicker files={files} onChange={setFiles} multiple label="Прикрепить файлы" />
        </div>
        <ErrorMessage text={error} />
      </form>
    </Modal>
  );
}

// изменение сроков задания
function DeadlineModal({ assignment, ask, onClose, onSaved }) {
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (assignment) {
      setStartDate(assignment.startDate);
      setDueDate(assignment.dueDate);
      setError('');
    }
  }, [assignment]);

  const save = (event) => {
    event.preventDefault();
    if (!startDate || !dueDate) return setError('Укажите обе даты');
    if (startDate !== assignment.startDate && startDate < todayISO()) return setError('Дата начала не может быть в прошлом');
    if (dueDate < todayISO()) return setError('Срок сдачи не может быть в прошлом');
    if (dueDate < startDate) return setError('Срок сдачи не может быть раньше даты начала');
    setError('');
    ask({
      title: 'Изменение срока',
      text: `Установить срок задания «${assignment.title}»: с ${formatDate(startDate)} по ${formatDate(dueDate)}?`,
      confirmText: 'Сохранить',
      action: async () => {
        await http.put(`/teacher/assignments/${assignment.id}/deadline`, { startDate, dueDate });
        onClose();
        onSaved();
      }
    });
  };

  return (
    <Modal
      open={!!assignment}
      title="⏰ Срок задания"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-light" onClick={onClose}>Отмена</button>
          <button type="submit" form="deadline-form" className="btn btn-primary">Сохранить</button>
        </>
      }
    >
      <form id="deadline-form" className="form" onSubmit={save}>
        <label>Доступно с<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>Срок сдачи<input type="date" min={todayISO()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
        <ErrorMessage text={error} />
      </form>
    </Modal>
  );
}

// работы студентов по заданию
function SubmissionsModal({ assignment, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!assignment) return;
    setData(null);
    setError('');
    http.get(`/teacher/assignments/${assignment.id}/submissions`)
      .then((response) => setData(response.data))
      .catch((err) => setError(errorText(err)));
  }, [assignment]);

  return (
    <Modal open={!!assignment} title={`📥 Работы: ${assignment?.title || ''}`} onClose={onClose} size="lg">
      <ErrorMessage text={error} />
      {!data && !error && <Loader />}
      {data && (
        data.students.length === 0 ? <p className="muted">У задания нет групп.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Студент</th><th>Группа</th><th>Статус</th><th>Комментарий</th><th>Файл</th></tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.studentId}>
                    <td>{s.name}</td>
                    <td>{s.group}</td>
                    <td>{s.submitted ? <span className="badge badge-green">сдано {formatDateTime(s.submittedAt)}</span> : <span className="badge badge-gray">не сдано</span>}</td>
                    <td>{s.comment || '-'}</td>
                    <td>{s.file ? <FileLink file={s.file} /> : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </Modal>
  );
}

export default TeacherLessons;
