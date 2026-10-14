import { useState } from 'react';
import http, { errorText } from '../../api/http';
import { EmptyState, Loader, PageTitle, useLoad } from '../../components/Common';
import ErrorMessage from '../../components/ErrorMessage';
import Modal from '../../components/Modal';
import { useConfirm } from '../../components/ConfirmModal';

// Дисциплины: выбор дисциплин, которые ведет преподаватель, добавление новых в общий справочник
function TeacherDisciplines() {
  const { data, error, loading, reload } = useLoad(() => http.get('/teacher/disciplines').then((r) => r.data.disciplines));
  const [confirmElement, ask] = useConfirm();
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');

  const select = (discipline) => ask({
    title: 'Выбор дисциплины',
    text: `Добавить «${discipline.name}» в ваши дисциплины?`,
    details: 'Дисциплина появится на главной странице, в занятиях, оценках и расписании.',
    confirmText: 'Добавить',
    action: async () => {
      await http.post('/teacher/courses', { disciplineId: discipline.id });
      reload();
    }
  });

  const unselect = (discipline) => ask({
    title: 'Убрать дисциплину',
    text: `Убрать «${discipline.name}» из ваших дисциплин?`,
    details: 'Вместе с ней будут удалены ваши модули, занятия, задания, оценки и отметки посещаемости по этой дисциплине. Действие нельзя отменить.',
    confirmText: 'Убрать',
    danger: true,
    action: async () => {
      await http.delete(`/teacher/courses/${discipline.courseId}`);
      reload();
    }
  });

  const remove = (discipline) => ask({
    title: 'Удаление из справочника',
    text: `Удалить дисциплину «${discipline.name}» из общего списка?`,
    details: 'Дисциплина пропадет из списка у всех преподавателей. Ваши занятия и оценки по ней тоже будут удалены.',
    confirmText: 'Удалить',
    danger: true,
    action: async () => {
      await http.delete(`/teacher/disciplines/${discipline.id}`);
      reload();
    }
  });

  const openAdd = () => {
    setNewName('');
    setAddError('');
    setAddOpen(true);
  };

  const add = (event) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      setAddError('Введите название дисциплины');
      return;
    }
    if (data.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
      setAddError('Такая дисциплина уже есть в списке - просто выберите ее');
      return;
    }
    setAddError('');
    ask({
      title: 'Новая дисциплина',
      text: `Добавить дисциплину «${name}» в общий список и в ваши дисциплины?`,
      confirmText: 'Добавить',
      action: async () => {
        await http.post('/teacher/disciplines', { name });
        setAddOpen(false);
        reload();
      }
    });
  };

  const filtered = (data || []).filter((d) => d.name.toLowerCase().includes(search.trim().toLowerCase()));
  const mine = filtered.filter((d) => d.selected);
  const others = filtered.filter((d) => !d.selected);

  const card = (discipline) => (
    <div key={discipline.id} className={`pick-card ${discipline.selected ? 'selected' : ''}`}>
      <div className="pick-card-main">
        <span className="pick-icon">{discipline.selected ? '✅' : '📘'}</span>
        <div>
          <div className="strong">{discipline.name}</div>
          <div className="muted small">
            {discipline.createdByMe ? 'добавлена вами' : 'из общего списка'}
            {discipline.usedByOthers > 0 && ` · ведут еще ${discipline.usedByOthers} преп.`}
          </div>
        </div>
      </div>
      <div className="pick-actions">
        {discipline.selected ? (
          <button type="button" className="btn btn-light btn-small" onClick={() => unselect(discipline)}>Убрать из моих</button>
        ) : (
          <button type="button" className="btn btn-primary btn-small" onClick={() => select(discipline)}>Выбрать</button>
        )}
        {discipline.createdByMe && discipline.usedByOthers === 0 && (
          <button type="button" className="icon-btn" title="Удалить из общего списка" onClick={() => remove(discipline)}>🗑</button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <PageTitle icon="🎓" title="Дисциплины" subtitle="Выберите дисциплины, которые вы ведете. Выбор сохраняется и отображается на главной странице">
        <button type="button" className="btn btn-accent btn-large" onClick={openAdd}>➕ Добавить дисциплину</button>
      </PageTitle>

      {loading && !data && <Loader />}
      {error && <ErrorMessage text={errorText(error)} onRetry={reload} />}

      {data && (
        <>
          <input className="search-input" placeholder="🔍 Поиск дисциплины…" value={search} onChange={(e) => setSearch(e.target.value)} />

          <h2 className="section-title">✅ Мои дисциплины <span className="muted">({mine.length})</span></h2>
          {mine.length === 0 ? (
            <EmptyState icon="📭" title="Пока ничего не выбрано" text="Нажмите «Выбрать» у нужной дисциплины ниже или добавьте новую." />
          ) : (
            <div className="pick-grid">{mine.map(card)}</div>
          )}

          <h2 className="section-title">📚 Все дисциплины <span className="muted">({others.length})</span></h2>
          {others.length === 0 ? (
            <p className="muted">{search ? 'Ничего не найдено.' : 'Все дисциплины уже выбраны.'}</p>
          ) : (
            <div className="pick-grid">{others.map(card)}</div>
          )}
        </>
      )}

      <Modal
        open={addOpen}
        title="➕ Новая дисциплина"
        onClose={() => setAddOpen(false)}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-light" onClick={() => setAddOpen(false)}>Отмена</button>
            <button type="submit" form="add-discipline-form" className="btn btn-primary">Добавить</button>
          </>
        }
      >
        <form id="add-discipline-form" className="form" onSubmit={add}>
          <label>
            Название дисциплины
            <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={255} autoFocus />
          </label>
          <p className="muted small">Дисциплина сохранится в базе данных и станет доступна для выбора всем преподавателям.</p>
          <ErrorMessage text={addError} />
        </form>
      </Modal>

      {confirmElement}
    </>
  );
}

export default TeacherDisciplines;
