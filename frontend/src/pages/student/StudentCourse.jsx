import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import http, { errorText } from '../../api/http';
import { EmptyState, Loader, TypeBadge, useLoad } from '../../components/Common';
import ErrorMessage from '../../components/ErrorMessage';
import Modal from '../../components/Modal';
import { FileLink } from '../../components/Files';
import NewMessageModal from '../../components/NewMessageModal';
import { LESSON_STATUSES, LESSON_TYPES, TIME_SLOTS } from '../../utils/constants';
import { formatDate } from '../../utils/dates';

// Страница одного курса у студента: модули и занятия
function StudentCourse() {
  const { id } = useParams();
  const { data, error, loading, reload } = useLoad(() => http.get(`/student/courses/${id}`).then((r) => r.data), [id]);
  const [lesson, setLesson] = useState(null);
  const [viewError, setViewError] = useState('');
  const [writeOpen, setWriteOpen] = useState(false);

  // открытие занятия: отметка о просмотре сохраняется на сервере
  const openLesson = async (item) => {
    setLesson(item);
    setViewError('');
    if (item.status === 'pending' || item.viewed) return;
    try {
      await http.post(`/student/lessons/${item.id}/view`);
      reload();
    } catch (err) {
      setViewError(errorText(err));
    }
  };

  if (loading && !data) return <Loader />;
  if (error) {
    return (
      <>
        <Link to="/student/courses" className="back-link">← К списку курсов</Link>
        <ErrorMessage text={errorText(error)} onRetry={reload} />
      </>
    );
  }

  const { course, modules, lessons } = data;

  return (
    <>
      <Link to="/student/courses" className="back-link">← К списку курсов</Link>

      <section className="course-header card">
        <div>
          <h1>{course.discipline}</h1>
          <div className="muted">👨‍🏫 {course.teacher}</div>
          <p>{course.description || 'Описание курса пока не добавлено.'}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setWriteOpen(true)}>✉️ Написать преподавателю</button>
      </section>

      {modules.length === 0 && (
        <EmptyState icon="🧩" title="Модули еще не добавлены" text="Преподаватель пока не наполнил курс." />
      )}

      {modules.map((module, index) => {
        const moduleLessons = lessons.filter((l) => l.moduleId === module.id);
        return (
          <section key={module.id} className="module-block">
            <h2 className="module-title"><span className="module-number">{index + 1}</span>{module.name}</h2>
            {moduleLessons.length === 0 ? (
              <p className="muted">В этом модуле пока нет занятий для вашей группы.</p>
            ) : (
              <div className="lesson-list">
                {moduleLessons.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`lesson-row status-${item.status}`}
                    style={{ borderLeftColor: LESSON_TYPES[item.type]?.color }}
                    onClick={() => openLesson(item)}
                  >
                    <div className="lesson-row-main">
                      <div className="strong">{item.title}</div>
                      <div className="muted small">
                        {formatDate(item.date)} · {TIME_SLOTS[item.slot]} · ауд. {item.room}
                      </div>
                    </div>
                    <TypeBadge type={item.type} types={LESSON_TYPES} />
                    <span className="lesson-status">
                      {LESSON_STATUSES[item.status].icon} {LESSON_STATUSES[item.status].name}
                      {item.viewed && <span className="viewed"> · 👁 просмотрено</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <Modal open={!!lesson} title={lesson?.title || ''} onClose={() => setLesson(null)} size="md">
        {lesson && (
          <div className="details">
            <div className="details-row"><span>Тип</span><TypeBadge type={lesson.type} types={LESSON_TYPES} /></div>
            <div className="details-row"><span>Дата и время</span><b>{formatDate(lesson.date)}, {TIME_SLOTS[lesson.slot]}</b></div>
            <div className="details-row"><span>Аудитория</span><b>{lesson.room}</b></div>
            {lesson.duration && <div className="details-row"><span>Длительность</span><b>{lesson.duration}</b></div>}
            <div className="details-row"><span>Статус</span><b>{LESSON_STATUSES[lesson.status].icon} {LESSON_STATUSES[lesson.status].name}</b></div>
            {lesson.status === 'pending' ? (
              <div className="info-box">🔒 Занятие еще не открыто преподавателем - темы и материалы станут доступны позже.</div>
            ) : (
              <>
                <h4>Темы занятия</h4>
                <p className="pre">{lesson.topics || 'Темы не указаны.'}</p>
                <h4>Материалы</h4>
                {lesson.files.length === 0 ? (
                  <p className="muted">Материалы не прикреплены.</p>
                ) : (
                  <div className="file-links">{lesson.files.map((file) => <FileLink key={file.id} file={file} />)}</div>
                )}
              </>
            )}
            <ErrorMessage text={viewError} />
          </div>
        )}
      </Modal>

      <NewMessageModal
        open={writeOpen}
        onClose={() => setWriteOpen(false)}
        fixedCourseId={course.id}
      />
    </>
  );
}

export default StudentCourse;
