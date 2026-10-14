const express = require('express');
const { query, transaction } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { saveFile } = require('../utils/files');
const { AppError, handle, isId, now, fullName, text } = require('../utils/helpers');

// Мини-мессенджер: общий для студента и преподавателя.
// Диалог (conversation) - переписка одного студента с одним преподавателем по одной дисциплине.
// Новое письмо тому же человеку по той же дисциплине продолжает диалог, тема диалога меняется на тему нового письма.

const router = express.Router();
router.use('/messages', requireAuth);

// условие "диалог принадлежит текущему пользователю"
const ownerCondition = (user) =>
  user.role === 'student'
    ? { sql: 'cv.student_id = ?', id: user.studentId }
    : { sql: 'cv.teacher_id = ?', id: user.teacherId };

// роль собеседника
const otherRole = (user) => (user.role === 'student' ? 'teacher' : 'student');

// диалог текущего пользователя (иначе 404)
const getMyConversation = async (conversationId, user) => {
  if (!isId(conversationId)) throw new AppError(400, 'Некорректный диалог');
  const owner = ownerCondition(user);
  const rows = await query(
    `SELECT cv.id, cv.student_id, cv.teacher_id, cv.course_id, cv.subject, cv.updated_at,
            d.name AS discipline,
            su.last_name AS s_last_name, su.first_name AS s_first_name, su.patronymic AS s_patronymic, su.email AS s_email,
            g.name AS group_name,
            tu.last_name AS t_last_name, tu.first_name AS t_first_name, tu.patronymic AS t_patronymic, tu.email AS t_email
     FROM conversation AS cv
     INNER JOIN student AS st ON st.id = cv.student_id
     INNER JOIN users AS su ON su.id = st.user_id
     INNER JOIN student_group AS g ON g.id = st.group_id
     INNER JOIN teacher AS te ON te.id = cv.teacher_id
     INNER JOIN users AS tu ON tu.id = te.user_id
     LEFT JOIN course AS c ON c.id = cv.course_id
     LEFT JOIN discipline AS d ON d.id = c.discipline_id
     WHERE cv.id = ? AND ${owner.sql}`,
    [conversationId, owner.id]
  );
  if (rows.length === 0) throw new AppError(404, 'Диалог не найден');
  return rows[0];
};

// собеседник для отображения в шапке диалога
const participant = (row, user) =>
  user.role === 'student'
    ? { role: 'teacher', name: fullName(row, 't_'), email: row.t_email, discipline: row.discipline || 'Дисциплина удалена' }
    : { role: 'student', name: fullName(row, 's_'), email: row.s_email, group: row.group_name, discipline: row.discipline || 'Дисциплина удалена' };

// запись в "последние действия" студента о новом ответе преподавателя
const addReplyActivity = async (run, studentId, teacherName, discipline) => {
  await run(
    'INSERT INTO activity (student_id, activity_type, description, created_at) VALUES (?, ?, ?, ?)',
    [studentId, 'reply', `Ответ преподавателя ${teacherName} (${discipline || 'сообщения'})`.slice(0, 255), now()]
  );
};

// ===== Список диалогов =====
router.get('/messages/conversations', handle(async (req, res) => {
  const user = req.user;
  const owner = ownerCondition(user);
  const rows = await query(
    `SELECT cv.id, cv.subject, cv.updated_at, d.name AS discipline, g.name AS group_name,
            su.last_name AS s_last_name, su.first_name AS s_first_name, su.patronymic AS s_patronymic, su.email AS s_email,
            tu.last_name AS t_last_name, tu.first_name AS t_first_name, tu.patronymic AS t_patronymic, tu.email AS t_email,
            (SELECT COUNT(*) FROM message AS m
              WHERE m.conversation_id = cv.id AND m.sender_role = ? AND m.is_read = 0) AS unread
     FROM conversation AS cv
     INNER JOIN student AS st ON st.id = cv.student_id
     INNER JOIN users AS su ON su.id = st.user_id
     INNER JOIN student_group AS g ON g.id = st.group_id
     INNER JOIN teacher AS te ON te.id = cv.teacher_id
     INNER JOIN users AS tu ON tu.id = te.user_id
     LEFT JOIN course AS c ON c.id = cv.course_id
     LEFT JOIN discipline AS d ON d.id = c.discipline_id
     WHERE ${owner.sql}
     ORDER BY cv.updated_at DESC, cv.id DESC`,
    [otherRole(user), owner.id]
  );

  const conversations = rows.map(r => ({
    id: r.id,
    subject: r.subject,
    updatedAt: r.updated_at,
    unread: Number(r.unread),
    with: participant(r, user)
  }));
  res.json({
    conversations,
    total: conversations.length,
    unread: conversations.reduce((sum, c) => sum + c.unread, 0)
  });
}));

// количество непрочитанных сообщений (для значка в шапке)
router.get('/messages/unread', handle(async (req, res) => {
  const owner = ownerCondition(req.user);
  const [row] = await query(
    `SELECT COUNT(*) AS count FROM message AS m
     INNER JOIN conversation AS cv ON cv.id = m.conversation_id
     WHERE ${owner.sql} AND m.sender_role = ? AND m.is_read = 0`,
    [owner.id, otherRole(req.user)]
  );
  res.json({ unread: Number(row.count) });
}));

// кому можно написать: студенту - преподаватели его курсов, преподавателю - студенты его групп
router.get('/messages/contacts', handle(async (req, res) => {
  const user = req.user;
  if (user.role === 'student') {
    const rows = await query(
      `SELECT c.id AS course_id, d.name AS discipline, u.last_name, u.first_name, u.patronymic
       FROM course AS c
       INNER JOIN course_group AS cg ON cg.course_id = c.id AND cg.group_id = ?
       INNER JOIN discipline AS d ON d.id = c.discipline_id
       INNER JOIN teacher AS t ON t.id = c.teacher_id
       INNER JOIN users AS u ON u.id = t.user_id
       ORDER BY d.name`,
      [user.groupId]
    );
    return res.json({
      contacts: rows.map(r => ({ courseId: r.course_id, discipline: r.discipline, name: fullName(r) }))
    });
  }

  const rows = await query(
    `SELECT c.id AS course_id, d.name AS discipline, st.id AS student_id, g.name AS group_name,
            u.last_name, u.first_name, u.patronymic
     FROM course AS c
     INNER JOIN discipline AS d ON d.id = c.discipline_id
     INNER JOIN course_group AS cg ON cg.course_id = c.id
     INNER JOIN student_group AS g ON g.id = cg.group_id
     INNER JOIN student AS st ON st.group_id = g.id
     INNER JOIN users AS u ON u.id = st.user_id
     WHERE c.teacher_id = ?
     ORDER BY d.name, g.name, u.last_name, u.first_name`,
    [user.teacherId]
  );
  res.json({
    contacts: rows.map(r => ({
      courseId: r.course_id, discipline: r.discipline, studentId: r.student_id, group: r.group_name, name: fullName(r)
    }))
  });
}));

// ===== Открытие диалога (сообщения собеседника отмечаются прочитанными) =====
router.get('/messages/conversations/:id', handle(async (req, res) => {
  const user = req.user;
  const conversation = await getMyConversation(req.params.id, user);

  await query(
    'UPDATE message SET is_read = 1 WHERE conversation_id = ? AND sender_role = ? AND is_read = 0',
    [conversation.id, otherRole(user)]
  );

  const messages = await query(
    `SELECT m.id, m.sender_role, m.subject, m.body, m.created_at, m.is_read, m.attachment_id, a.original_name
     FROM message AS m
     LEFT JOIN attachment AS a ON a.id = m.attachment_id
     WHERE m.conversation_id = ?
     ORDER BY m.created_at, m.id`,
    [conversation.id]
  );

  res.json({
    conversation: {
      id: conversation.id,
      subject: conversation.subject,
      updatedAt: conversation.updated_at,
      with: participant(conversation, user)
    },
    messages: messages.map(m => ({
      id: m.id,
      mine: m.sender_role === user.role,
      senderName: m.sender_role === 'student' ? fullName(conversation, 's_') : fullName(conversation, 't_'),
      subject: m.subject,
      body: m.body,
      createdAt: m.created_at,
      isRead: m.is_read === 1,
      file: m.attachment_id ? { id: m.attachment_id, name: m.original_name } : null
    }))
  });
}));

// ===== Новое письмо (создает диалог или продолжает существующий) =====
router.post('/messages/conversations', handle(async (req, res) => {
  const user = req.user;
  const subject = text(req.body.subject);
  const body = text(req.body.text);
  const courseId = req.body.courseId;

  if (!isId(courseId)) throw new AppError(400, 'Выберите получателя');
  if (!subject) throw new AppError(400, 'Введите тему письма');
  if (!body && !req.body.file) throw new AppError(400, 'Введите текст письма или прикрепите файл');

  let studentId;
  let teacherId;
  let discipline;

  if (user.role === 'student') {
    // курс должен быть у группы студента
    const rows = await query(
      `SELECT c.teacher_id, d.name AS discipline FROM course AS c
       INNER JOIN course_group AS cg ON cg.course_id = c.id AND cg.group_id = ?
       INNER JOIN discipline AS d ON d.id = c.discipline_id
       WHERE c.id = ?`,
      [user.groupId, courseId]
    );
    if (rows.length === 0) throw new AppError(400, 'Этот курс не относится к вашей группе');
    studentId = user.studentId;
    teacherId = rows[0].teacher_id;
    discipline = rows[0].discipline;
  } else {
    // студент должен учиться в группе, записанной на курс преподавателя
    if (!isId(req.body.studentId)) throw new AppError(400, 'Выберите студента');
    const rows = await query(
      `SELECT st.id, d.name AS discipline FROM course AS c
       INNER JOIN course_group AS cg ON cg.course_id = c.id
       INNER JOIN student AS st ON st.group_id = cg.group_id
       INNER JOIN discipline AS d ON d.id = c.discipline_id
       WHERE c.id = ? AND c.teacher_id = ? AND st.id = ?`,
      [courseId, user.teacherId, req.body.studentId]
    );
    if (rows.length === 0) throw new AppError(400, 'Студент не записан на этот курс');
    studentId = rows[0].id;
    teacherId = user.teacherId;
    discipline = rows[0].discipline;
  }

  const conversationId = await transaction(async (run) => {
    const existing = await run(
      'SELECT id FROM conversation WHERE student_id = ? AND teacher_id = ? AND course_id = ?',
      [studentId, teacherId, courseId]
    );
    let id;
    if (existing.length > 0) {
      id = existing[0].id;
      await run('UPDATE conversation SET subject = ?, updated_at = ? WHERE id = ?', [subject.slice(0, 255), now(), id]);
    } else {
      const result = await run(
        'INSERT INTO conversation (student_id, teacher_id, course_id, subject, updated_at) VALUES (?, ?, ?, ?, ?)',
        [studentId, teacherId, courseId, subject.slice(0, 255), now()]
      );
      id = result.insertId;
    }
    const fileId = req.body.file ? await saveFile(run, req.body.file, user.id) : null;
    await run(
      `INSERT INTO message (conversation_id, sender_role, subject, body, attachment_id, created_at, is_read)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [id, user.role, subject.slice(0, 255), body, fileId, now()]
    );
    if (user.role === 'teacher') {
      await addReplyActivity(run, studentId, user.fullName, discipline);
    }
    return id;
  });

  res.status(201).json({ message: 'Письмо отправлено', conversationId });
}));

// ===== Ответ в диалоге =====
router.post('/messages/conversations/:id/messages', handle(async (req, res) => {
  const user = req.user;
  const conversation = await getMyConversation(req.params.id, user);
  const subject = text(req.body.subject) || conversation.subject;
  const body = text(req.body.text);

  if (!body && !req.body.file) throw new AppError(400, 'Введите текст ответа или прикрепите файл');

  await transaction(async (run) => {
    const fileId = req.body.file ? await saveFile(run, req.body.file, user.id) : null;
    await run(
      `INSERT INTO message (conversation_id, sender_role, subject, body, attachment_id, created_at, is_read)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [conversation.id, user.role, subject.slice(0, 255), body, fileId, now()]
    );
    await run('UPDATE conversation SET subject = ?, updated_at = ? WHERE id = ?', [subject.slice(0, 255), now(), conversation.id]);
    if (user.role === 'teacher') {
      await addReplyActivity(run, conversation.student_id, user.fullName, conversation.discipline);
    }
  });
  res.status(201).json({ message: 'Ответ отправлен' });
}));

// ===== Удаление сообщения (только своего) =====
router.delete('/messages/:id', handle(async (req, res) => {
  const user = req.user;
  if (!isId(req.params.id)) throw new AppError(400, 'Некорректное сообщение');
  const owner = ownerCondition(user);
  const rows = await query(
    `SELECT m.id, m.conversation_id, m.sender_role FROM message AS m
     INNER JOIN conversation AS cv ON cv.id = m.conversation_id
     WHERE m.id = ? AND ${owner.sql}`,
    [req.params.id, owner.id]
  );
  if (rows.length === 0) throw new AppError(404, 'Сообщение не найдено');
  if (rows[0].sender_role !== user.role) throw new AppError(403, 'Удалять можно только свои сообщения');

  let conversationDeleted = false;
  await transaction(async (run) => {
    await run('DELETE FROM message WHERE id = ?', [rows[0].id]);
    const [left] = await run('SELECT COUNT(*) AS count FROM message WHERE conversation_id = ?', [rows[0].conversation_id]);
    if (Number(left.count) === 0) {
      // пустой диалог больше не нужен
      await run('DELETE FROM conversation WHERE id = ?', [rows[0].conversation_id]);
      conversationDeleted = true;
    }
  });
  res.json({ message: 'Сообщение удалено', conversationDeleted });
}));

// ===== Удаление всего диалога =====
router.delete('/messages/conversations/:id', handle(async (req, res) => {
  const conversation = await getMyConversation(req.params.id, req.user);
  await query('DELETE FROM conversation WHERE id = ?', [conversation.id]);
  res.json({ message: 'Диалог удален' });
}));

module.exports = router;
