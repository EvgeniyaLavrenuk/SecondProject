import { useState } from 'react';
import http, { errorText } from '../../api/http';
import { EmptyState, Loader, PageTitle, useLoad } from '../../components/Common';
import ErrorMessage, { SuccessMessage } from '../../components/ErrorMessage';
import Modal from '../../components/Modal';
import ConfirmModal from '../../components/ConfirmModal';
import { FileLink, FilePicker } from '../../components/Files';
import NewMessageModal from '../../components/NewMessageModal';
import { formatDate, formatDateTime } from '../../utils/dates';

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'upcoming', label: 'Еще не доступны' },
  { key: 'expired', label: 'Срок прошел' }
];

// состояние задания относительно сегодняшней даты
const stateOf = (assignment, today) => {
  if (assignment.startDate > today) return 'upcoming';
  if (assignment.dueDate < today) return 'expired';
  return 'active';
};

const STATE_INFO = {
  active: { label: 'Доступно', className: 'badge-green' },
  upcoming: { label: 'Еще не доступно', className: 'badge-gray' },
  expired: { label: 'Срок прошел', className: 'badge-red' }
};

// Мои задания: задания преподавателей по курсам группы, разбитые по курсам
function StudentAssignments() {
  const { data, error, loading, reload } = useLoad(() => http.get('/student/assignments').then((r) => r.data));
  const [filter, setFilter] = useState('all');
  const [details, setDetails] = useState(null);
  const [submitFor, setSubmitFor] = useState(null);
  const [contactFor, setContactFor] = useState(null);

  if (loading && !data) return <Loader />;

  const today = data?.today;
  const list = data ? data.assignments.filter((a) => filter === 'all' || stateOf(a, today) === filter) : [];
  const count = (key) => (data ? data.assignments.filter((a) => key === 'all' || stateOf(a, today) === key).length : 0);

  // группировка по курсам
  const groups = [];
  list.forEach((assignment) => {
    let group = groups.find((g) => g.courseId === assignment.courseId);
    if (!group) {
      group = { courseId: assignment.courseId, discipline: assignment.discipline, teacher: assignment.teacher, items: [] };
      groups.push(group);
    }
    group.items.push(assignment);
  });

  return (
    <>
      <PageTitle icon="📝" title="Мои задания" subtitle="Задания преподавателей по курсам вашей группы" />
      {error && <ErrorMessage text={errorText(error)} onRetry={reload} />}

      {data && (
        <>
          <div className="filter-tabs">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={filter === f.key ? 'active' : ''} onClick={() => setFilter(f.key)}>
                {f.label} <span className="filter-count">{count(f.key)}</span>
              </button>
            ))}
          </div>

          {groups.length === 0 && (
            <EmptyState
              icon="🎉"
              title={data.assignments.length === 0 ? 'Заданий пока нет' : 'В этой категории заданий нет'}
              text={data.assignments.length === 0 ? 'Задания появятся, когда преподаватели добавят их для вашей группы.' : ''}
            />
          )}

          {groups.map((group) => (
            <section key={group.courseId} className="course-block">
              <h2 className="course-block-title">
                📘 {group.discipline}
                <span className="muted small"> · {group.teacher}</span>
              </h2>
              <div className="assignment-grid">
                {group.items.map((assignment) => {
                  const state = stateOf(assignment, today);
                  return (
                    <div key={assignment.id} className={`assignment-card state-${state}`}>
                      <div className="assignment-top">
                        <span className={`badge ${STATE_INFO[state].className}`}>{STATE_INFO[state].label}</span>
                        {assignment.submission && <span className="badge badge-purple">📤 Отправлено</span>}
                      </div>
                      <h3>{assignment.title}</h3>
                      <p className="muted clamp">{assignment.description || 'Без описания'}</p>
                      <div className="assignment-dates small">
                        <div>🟢 Доступно с: <b>{formatDate(assignment.startDate)}</b></div>
                        <div>⏰ Срок сдачи: <b>{formatDate(assignment.dueDate)}</b></div>
                        {assignment.files.length > 0 && <div>📎 Файлов: {assignment.files.length}</div>}
                      </div>
                      <div className="assignment-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-small"
                          onClick={() => setSubmitFor(assignment)}
                          disabled={state !== 'active'}
                          title={state === 'upcoming' ? 'Задание еще недоступно' : state === 'expired' ? 'Срок сдачи прошел' : ''}
                        >
                          📤 {assignment.submission ? 'Отправить заново' : 'Отправить'}
                        </button>
                        <button type="button" className="btn btn-light btn-small" onClick={() => setDetails(assignment)}>ℹ️ Подробнее</button>
                        <button type="button" className="btn btn-light btn-small" onClick={() => setContactFor(assignment)}>✉️ Связаться с преподавателем</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      {/* Подробнее */}
      <Modal open={!!details} title={details?.title || ''} onClose={() => setDetails(null)}>
        {details && (
          <div className="details">
            <div className="details-row"><span>Курс</span><b>{details.discipline}</b></div>
            <div className="details-row"><span>Преподаватель</span><b>{details.teacher}</b></div>
            <div className="details-row"><span>Доступно</span><b>с {formatDate(details.startDate)} по {formatDate(details.dueDate)}</b></div>
            <div className="details-row"><span>Состояние</span><b>{STATE_INFO[stateOf(details, today)].label}</b></div>
            <h4>Описание</h4>
            <p className="pre">{details.description || 'Без описания'}</p>
            <h4>Файлы задания</h4>
            {details.files.length === 0 ? <p className="muted">Файлы не прикреплены.</p> : (
              <div className="file-links">{details.files.map((f) => <FileLink key={f.id} file={f} />)}</div>
            )}
            <h4>Моя работа</h4>
            {details.submission ? (
              <div className="info-box">
                <div>Отправлено: {formatDateTime(details.submission.submittedAt)}</div>
                {details.submission.comment && <div>Комментарий: {details.submission.comment}</div>}
                {details.submission.file && <FileLink file={details.submission.file} />}
              </div>
            ) : <p className="muted">Работа еще не отправлена.</p>}
          </div>
        )}
      </Modal>

      <SubmitModal assignment={submitFor} onClose={() => setSubmitFor(null)} onDone={reload} />

      <NewMessageModal
        open={!!contactFor}
        onClose={() => setContactFor(null)}
        fixedCourseId={contactFor?.courseId}
        defaultSubject={contactFor ? `Вопрос по заданию «${contactFor.title}»` : ''}
      />
    </>
  );
}

// окно отправки работы
function SubmitModal({ assignment, onClose, onDone }) {
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [lastId, setLastId] = useState(null);

  // сброс формы при открытии для другого задания
  if (assignment && assignment.id !== lastId) {
    setLastId(assignment.id);
    setComment('');
    setFiles([]);
    setError('');
    setSuccess('');
    setBusy(false);
  }

  const send = async () => {
    await http.post(`/student/assignments/${assignment.id}/submit`, { comment, file: files[0] || null });
    setSuccess('Работа отправлена преподавателю');
    onDone();
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!comment.trim() && files.length === 0) {
      setError('Добавьте комментарий или прикрепите файл');
      return;
    }
    // повторная отправка заменяет прошлую - требуется подтверждение
    if (assignment.submission) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    try {
      await send();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setLastId(null);
    onClose();
  };

  return (
    <>
      <Modal
        open={!!assignment}
        title={`📤 Отправка работы`}
        onClose={close}
        footer={success ? (
          <button type="button" className="btn btn-primary" onClick={close}>Готово</button>
        ) : (
          <>
            <button type="button" className="btn btn-light" onClick={close}>Отмена</button>
            <button type="submit" form="submit-form" className="btn btn-primary" disabled={busy}>{busy ? 'Отправка…' : 'Отправить'}</button>
          </>
        )}
      >
        {assignment && (
          <form id="submit-form" className="form" onSubmit={submit}>
            <div className="muted">Задание: <b>{assignment.title}</b> · срок до {formatDate(assignment.dueDate)}</div>
            {assignment.submission && (
              <div className="info-box">Работа уже отправлялась {formatDateTime(assignment.submission.submittedAt)}. Новая отправка заменит предыдущую.</div>
            )}
            <label>Комментарий<textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} disabled={!!success} /></label>
            {!success && <FilePicker files={files} onChange={setFiles} label="Прикрепить файл с работой" />}
            <ErrorMessage text={error} />
            <SuccessMessage text={success} />
          </form>
        )}
      </Modal>
      <ConfirmModal
        open={confirm}
        title="Повторная отправка"
        text="Заменить ранее отправленную работу новой?"
        confirmText="Заменить"
        onConfirm={send}
        onClose={() => setConfirm(false)}
      />
    </>
  );
}

export default StudentAssignments;
