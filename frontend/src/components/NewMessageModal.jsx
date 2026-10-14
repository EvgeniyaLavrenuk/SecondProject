import { useEffect, useState } from 'react';
import http, { errorText } from '../api/http';
import { useAuth } from '../context/AuthContext';
import Modal from './Modal';
import ErrorMessage, { SuccessMessage } from './ErrorMessage';
import { FilePicker } from './Files';
import { notifyMessagesChanged } from './Layout';

// Окно нового письма.
// Студент выбирает дисциплину (письмо уходит ее преподавателю),
// преподаватель - дисциплину и студента из записанных групп.
// Если диалог с этим человеком по этой дисциплине уже есть, письмо продолжает его.
function NewMessageModal({ open, onClose, onSent, fixedCourseId, fixedStudentId, defaultSubject = '' }) {
  const { user } = useAuth();
  const isStudent = user.role === 'student';

  const [contacts, setContacts] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [courseId, setCourseId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCourseId(fixedCourseId ? String(fixedCourseId) : '');
    setStudentId(fixedStudentId ? String(fixedStudentId) : '');
    setSubject(defaultSubject);
    setText('');
    setFiles([]);
    setError('');
    setSuccess('');
    setBusy(false);
    setLoadError('');
    http.get('/messages/contacts')
      .then((response) => setContacts(response.data.contacts))
      .catch((err) => setLoadError(errorText(err)));
  }, [open, fixedCourseId, fixedStudentId, defaultSubject]);

  // дисциплины без повторов (у преподавателя контакты идут по студентам)
  const courses = [];
  contacts.forEach((contact) => {
    if (!courses.some((c) => c.courseId === contact.courseId)) courses.push(contact);
  });
  const students = contacts.filter((contact) => String(contact.courseId) === courseId);
  const selectedCourse = courses.find((c) => String(c.courseId) === courseId);

  const send = async (event) => {
    event.preventDefault();
    setError('');
    if (!courseId) return setError(isStudent ? 'Выберите дисциплину' : 'Выберите дисциплину');
    if (!isStudent && !studentId) return setError('Выберите студента');
    if (!subject.trim()) return setError('Введите тему письма');
    if (!text.trim() && files.length === 0) return setError('Введите текст письма или прикрепите файл');

    setBusy(true);
    try {
      const response = await http.post('/messages/conversations', {
        courseId: Number(courseId),
        studentId: isStudent ? undefined : Number(studentId),
        subject,
        text,
        file: files[0] || null
      });
      setSuccess('Письмо отправлено');
      notifyMessagesChanged();
      if (onSent) onSent(response.data.conversationId);
      setTimeout(onClose, 700);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="✉️ Новое письмо"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-light" onClick={onClose}>Отмена</button>
          <button type="submit" form="new-message-form" className="btn btn-primary" disabled={busy || !!success}>
            {busy ? 'Отправка…' : 'Отправить'}
          </button>
        </>
      }
    >
      <form id="new-message-form" className="form" onSubmit={send}>
        <ErrorMessage text={loadError} />
        <label>
          Дисциплина
          <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setStudentId(''); }} disabled={!!fixedCourseId}>
            <option value="">Выберите дисциплину</option>
            {courses.map((c) => (
              <option key={c.courseId} value={c.courseId}>
                {c.discipline}{isStudent ? ` - ${c.name}` : ''}
              </option>
            ))}
          </select>
        </label>

        {isStudent && selectedCourse && (
          <div className="muted small">Получатель: 👨‍🏫 {selectedCourse.name}</div>
        )}

        {!isStudent && (
          <label>
            Студент
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={!courseId || !!fixedStudentId}>
              <option value="">Выберите студента</option>
              {students.map((s) => (
                <option key={s.studentId} value={s.studentId}>{s.name} ({s.group})</option>
              ))}
            </select>
          </label>
        )}

        <label>Тема<input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={255} /></label>
        <label>Сообщение<textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} /></label>
        <FilePicker files={files} onChange={setFiles} />
        <ErrorMessage text={error} />
        <SuccessMessage text={success} />
      </form>
    </Modal>
  );
}

export default NewMessageModal;
