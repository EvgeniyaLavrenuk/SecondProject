import { useCallback, useEffect, useRef, useState } from 'react';
import http, { errorText } from '../api/http';
import { useAuth } from '../context/AuthContext';
import { EmptyState, Loader, PageTitle, StatCard } from '../components/Common';
import ErrorMessage from '../components/ErrorMessage';
import ConfirmModal from '../components/ConfirmModal';
import NewMessageModal from '../components/NewMessageModal';
import { FileLink, FilePicker } from '../components/Files';
import { notifyMessagesChanged } from '../components/Layout';
import { formatDate, shortDateTime } from '../utils/dates';

// Мини-мессенджер (общий для студента и преподавателя)
function Messenger() {
  const { user } = useAuth();
  const isStudent = user.role === 'student';

  const [list, setList] = useState(null);
  const [listError, setListError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [dialogError, setDialogError] = useState('');
  const [dialogLoading, setDialogLoading] = useState(false);

  const [reply, setReply] = useState('');
  const [replyFiles, setReplyFiles] = useState([]);
  const [replyError, setReplyError] = useState('');
  const [sending, setSending] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const bottom = useRef(null);

  const loadList = useCallback(() => {
    return http.get('/messages/conversations')
      .then((response) => {
        setList(response.data);
        setListError('');
      })
      .catch((err) => setListError(errorText(err)));
  }, []);

  const loadDialog = useCallback((id) => {
    setDialogLoading(true);
    setDialogError('');
    return http.get(`/messages/conversations/${id}`)
      .then((response) => {
        setDialog(response.data);
        notifyMessagesChanged();
        return loadList();
      })
      .catch((err) => setDialogError(errorText(err)))
      .finally(() => setDialogLoading(false));
  }, [loadList]);

  useEffect(() => {
    loadList();
    const timer = setInterval(loadList, 20000);
    return () => clearInterval(timer);
  }, [loadList]);

  useEffect(() => {
    if (selectedId) loadDialog(selectedId);
    else setDialog(null);
    setReply('');
    setReplyFiles([]);
    setReplyError('');
  }, [selectedId, loadDialog]);

  // прокрутка к последнему сообщению
  useEffect(() => {
    if (bottom.current) bottom.current.scrollTop = bottom.current.scrollHeight;
  }, [dialog]);

  const sendReply = async (event) => {
    event.preventDefault();
    setReplyError('');
    if (!reply.trim() && replyFiles.length === 0) {
      setReplyError('Введите текст ответа или прикрепите файл');
      return;
    }
    setSending(true);
    try {
      await http.post(`/messages/conversations/${selectedId}/messages`, { text: reply, file: replyFiles[0] || null });
      setReply('');
      setReplyFiles([]);
      await loadDialog(selectedId);
    } catch (err) {
      setReplyError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  const removeMessage = async () => {
    const response = await http.delete(`/messages/${deleteMessage.id}`);
    if (response.data.conversationDeleted) {
      setSelectedId(null);
      await loadList();
    } else {
      await loadDialog(selectedId);
    }
  };

  const removeDialog = async () => {
    await http.delete(`/messages/conversations/${selectedId}`);
    setSelectedId(null);
    await loadList();
    notifyMessagesChanged();
  };

  const conversations = list?.conversations || [];
  const lastMessage = dialog?.messages[dialog.messages.length - 1];

  return (
    <>
      <PageTitle icon="💬" title="Сообщения" subtitle={isStudent ? 'Переписка с преподавателями' : 'Переписка со студентами'}>
        <button type="button" className="btn btn-primary" onClick={() => setNewOpen(true)}>✉️ Новое письмо</button>
      </PageTitle>

      <div className="stats-grid">
        <StatCard icon="💬" value={list ? list.total : '…'} label="Всего диалогов" color="purple" />
        <StatCard icon="🔔" value={list ? list.unread : '…'} label="Непрочитанных сообщений" color="orange" />
      </div>

      <ErrorMessage text={listError} onRetry={loadList} />

      <div className="messenger">
        <aside className="conv-list">
          {!list && !listError && <Loader />}
          {list && conversations.length === 0 && (
            <EmptyState icon="📭" title="Сообщений нет" text="Нажмите «Новое письмо», чтобы начать переписку." />
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`conv-item ${c.id === selectedId ? 'active' : ''} ${c.unread > 0 ? 'unread' : ''}`}
              onClick={() => setSelectedId(c.id)}
            >
              <div className="conv-top">
                <span className="conv-name">{c.with.name}</span>
                {c.unread > 0 && <span className="conv-badge">{c.unread}</span>}
              </div>
              <div className="conv-meta">{isStudent ? `📘 ${c.with.discipline}` : `👥 ${c.with.group} · 📘 ${c.with.discipline}`}</div>
              <div className="conv-subject">{c.subject}</div>
              <div className="conv-date">{shortDateTime(c.updatedAt)}</div>
            </button>
          ))}
        </aside>

        <section className="dialog">
          {!selectedId && (
            <div className="dialog-empty">
              <div className="empty-icon">✉️</div>
              <p>Выберите диалог слева, чтобы прочитать переписку</p>
            </div>
          )}

          {selectedId && dialogLoading && !dialog && <Loader />}
          {selectedId && <ErrorMessage text={dialogError} onRetry={() => loadDialog(selectedId)} />}

          {selectedId && dialog && (
            <>
              <div className="dialog-header">
                <div className="dialog-header-top">
                  <h2>{dialog.conversation.subject}</h2>
                  <button type="button" className="btn btn-danger btn-small" onClick={() => setDeleteDialog(true)}>🗑 Удалить диалог</button>
                </div>
                <div className="muted small">
                  📅 {formatDate(lastMessage?.createdAt || dialog.conversation.updatedAt)} · 🕐 {(lastMessage?.createdAt || dialog.conversation.updatedAt).slice(11, 16)}
                </div>
                <div className="dialog-from">
                  <div><span className="muted">От:</span> <b>{dialog.conversation.with.name}</b></div>
                  {isStudent ? (
                    <div><span className="muted">Дисциплина:</span> {dialog.conversation.with.discipline}</div>
                  ) : (
                    <div><span className="muted">Группа:</span> {dialog.conversation.with.group} · <span className="muted">Дисциплина:</span> {dialog.conversation.with.discipline}</div>
                  )}
                  <div><span className="muted">Email:</span> <a href={`mailto:${dialog.conversation.with.email}`}>{dialog.conversation.with.email}</a></div>
                </div>
              </div>

              <div className="dialog-messages" ref={bottom}>
                {dialog.messages.map((m) => (
                  <div key={m.id} className={`bubble-row ${m.mine ? 'mine' : ''}`}>
                    <div className="bubble">
                      <div className="bubble-head">
                        <span className="strong">{m.mine ? 'Вы' : m.senderName}</span>
                        <span className="muted small">{shortDateTime(m.createdAt)}</span>
                      </div>
                      <div className="bubble-subject">Тема: {m.subject}</div>
                      {m.body && <div className="bubble-body">{m.body}</div>}
                      {m.file && <FileLink file={m.file} />}
                      {m.mine && (
                        <div className="bubble-actions">
                          <span className="muted small">{m.isRead ? '✓✓ прочитано' : '✓ отправлено'}</span>
                          <button type="button" className="link-btn danger" onClick={() => setDeleteMessage(m)}>удалить</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <form className="reply-box" onSubmit={sendReply}>
                <textarea
                  rows={3}
                  placeholder="Напишите ответ…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
                <div className="reply-actions">
                  <FilePicker files={replyFiles} onChange={setReplyFiles} />
                  <button type="submit" className="btn btn-primary" disabled={sending}>{sending ? 'Отправка…' : '📨 Отправить'}</button>
                </div>
                <ErrorMessage text={replyError} />
              </form>
            </>
          )}
        </section>
      </div>

      <NewMessageModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onSent={(id) => {
          loadList();
          if (id === selectedId) loadDialog(id);
          else setSelectedId(id);
        }}
      />

      <ConfirmModal
        open={!!deleteMessage}
        title="Удаление сообщения"
        text="Удалить это сообщение? Оно пропадет и у собеседника."
        confirmText="Удалить"
        danger
        onConfirm={removeMessage}
        onClose={() => setDeleteMessage(null)}
      />
      <ConfirmModal
        open={deleteDialog}
        title="Удаление диалога"
        text="Удалить всю переписку? Все сообщения диалога будут удалены у обоих участников."
        confirmText="Удалить диалог"
        danger
        onConfirm={removeDialog}
        onClose={() => setDeleteDialog(false)}
      />
    </>
  );
}

export default Messenger;
