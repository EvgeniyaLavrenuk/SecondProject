const express = require('express');
const fs = require('fs');
const path = require('path');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { UPLOAD_DIR } = require('../utils/files');
const { AppError, handle, isId } = require('../utils/helpers');

const router = express.Router();

// есть ли у пользователя доступ к файлу
const canDownload = async (fileId, user) => {
  const [file] = await query('SELECT uploaded_by FROM attachment WHERE id = ?', [fileId]);
  if (!file) return false;
  if (file.uploaded_by === user.id) return true;

  if (user.role === 'teacher') {
    const rows = await query(
      `SELECT 1 AS ok FROM lesson_file AS lf
         INNER JOIN lesson AS l ON l.id = lf.lesson_id
         INNER JOIN module AS m ON m.id = l.module_id
         INNER JOIN course AS c ON c.id = m.course_id
         WHERE lf.attachment_id = ? AND c.teacher_id = ?
       UNION
       SELECT 1 FROM assignment_file AS af
         INNER JOIN assignment AS a ON a.id = af.assignment_id
         INNER JOIN course AS c ON c.id = a.course_id
         WHERE af.attachment_id = ? AND c.teacher_id = ?
       UNION
       SELECT 1 FROM submission AS s
         INNER JOIN assignment AS a ON a.id = s.assignment_id
         INNER JOIN course AS c ON c.id = a.course_id
         WHERE s.attachment_id = ? AND c.teacher_id = ?
       UNION
       SELECT 1 FROM message AS ms
         INNER JOIN conversation AS cv ON cv.id = ms.conversation_id
         WHERE ms.attachment_id = ? AND cv.teacher_id = ?`,
      [fileId, user.teacherId, fileId, user.teacherId, fileId, user.teacherId, fileId, user.teacherId]
    );
    return rows.length > 0;
  }

  // студент: материалы открытых занятий своей группы, файлы заданий группы, свои отправки и письма
  const rows = await query(
    `SELECT 1 AS ok FROM lesson_file AS lf
       INNER JOIN lesson AS l ON l.id = lf.lesson_id
       INNER JOIN lesson_group AS lg ON lg.lesson_id = l.id
       WHERE lf.attachment_id = ? AND lg.group_id = ? AND l.status <> 'pending'
     UNION
     SELECT 1 FROM assignment_file AS af
       INNER JOIN assignment_group AS ag ON ag.assignment_id = af.assignment_id
       WHERE af.attachment_id = ? AND ag.group_id = ?
     UNION
     SELECT 1 FROM submission AS s
       WHERE s.attachment_id = ? AND s.student_id = ?
     UNION
     SELECT 1 FROM message AS ms
       INNER JOIN conversation AS cv ON cv.id = ms.conversation_id
       WHERE ms.attachment_id = ? AND cv.student_id = ?`,
    [fileId, user.groupId, fileId, user.groupId, fileId, user.studentId, fileId, user.studentId]
  );
  return rows.length > 0;
};

// скачивание файла по id
router.get('/files/:id', requireAuth, handle(async (req, res) => {
  if (!isId(req.params.id)) throw new AppError(400, 'Некорректный файл');
  const rows = await query(
    'SELECT id, original_name, stored_name, mime_type FROM attachment WHERE id = ?',
    [req.params.id]
  );
  if (rows.length === 0) throw new AppError(404, 'Файл не найден');
  if (!(await canDownload(rows[0].id, req.user))) throw new AppError(403, 'Нет доступа к файлу');

  const filePath = path.join(UPLOAD_DIR, path.basename(rows[0].stored_name));
  if (!fs.existsSync(filePath)) throw new AppError(404, 'Файл отсутствует на сервере');

  res.setHeader('Content-Type', rows[0].mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(rows[0].original_name)}`);
  fs.createReadStream(filePath).pipe(res);
}));

module.exports = router;
