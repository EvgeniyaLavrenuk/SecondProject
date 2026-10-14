const express = require('express');
const { query, transaction } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { saveFile } = require('../utils/files');
const {
  AppError, handle, isId, isDate, today, now, fullName, placeholders, text
} = require('../utils/helpers');

const router = express.Router();
router.use('/student', requireAuth, requireRole('student'));

// запись в "последние действия" студента
const addActivity = async (run, studentId, type, description) => {
  await run(
    'INSERT INTO activity (student_id, activity_type, description, created_at) VALUES (?, ?, ?, ?)',
    [studentId, type, description.slice(0, 255), now()]
  );
};

// курс доступен студенту, если преподаватель записал на него группу студента
const getMyCourse = async (courseId, groupId) => {
  if (!isId(courseId)) throw new AppError(400, 'Некорректный курс');
  const rows = await query(
    `SELECT c.id, c.description, d.name AS discipline, t.id AS teacher_id,
            u.last_name, u.first_name, u.patronymic, u.email
     FROM course AS c
     INNER JOIN course_group AS cg ON cg.course_id = c.id AND cg.group_id = ?
     INNER JOIN discipline AS d ON d.id = c.discipline_id
     INNER JOIN teacher AS t ON t.id = c.teacher_id
     INNER JOIN users AS u ON u.id = t.user_id
     WHERE c.id = ?`,
    [groupId, courseId]
  );
  if (rows.length === 0) throw new AppError(404, 'Курс не найден');
  return rows[0];
};

// файлы для списка id занятий / заданий: { id: [ {id, name, size} ] }
const loadFiles = async (table, column, ids) => {
  const map = {};
  if (ids.length === 0) return map;
  const rows = await query(
    `SELECT x.${column} AS owner_id, a.id, a.original_name, a.size_bytes
     FROM ${table} AS x
     INNER JOIN attachment AS a ON a.id = x.attachment_id
     WHERE x.${column} IN (${placeholders(ids)})
     ORDER BY a.id`,
    ids
  );
  rows.forEach(row => {
    if (!map[row.owner_id]) map[row.owner_id] = [];
    map[row.owner_id].push({ id: row.id, name: row.original_name, size: row.size_bytes });
  });
  return map;
};

// ===== Главная страница =====
router.get('/student/dashboard', handle(async (req, res) => {
  const { studentId, groupId } = req.user;

  const [courses] = await query(
    'SELECT COUNT(*) AS count FROM course_group WHERE group_id = ?',
    [groupId]
  );

  // средний балл считается только по финальным оценкам
  const [average] = await query(
    "SELECT AVG(grade_value) AS value FROM grade WHERE student_id = ? AND grade_type = 'final'",
    [studentId]
  );

  // активные задания: уже доступны, срок не прошел и работа еще не отправлена
  const [active] = await query(
    `SELECT COUNT(*) AS count
     FROM assignment AS a
     INNER JOIN assignment_group AS ag ON ag.assignment_id = a.id AND ag.group_id = ?
     WHERE a.start_date <= ? AND a.due_date >= ?
       AND NOT EXISTS (SELECT 1 FROM submission AS s WHERE s.assignment_id = a.id AND s.student_id = ?)`,
    [groupId, today(), today(), studentId]
  );

  // посещаемость по каждому курсу (только там, где преподаватель ставил отметки)
  const attendanceRows = await query(
    `SELECT c.id AS course_id, d.name AS discipline, u.last_name, u.first_name, u.patronymic,
            COUNT(*) AS total, SUM(at.is_present) AS present
     FROM attendance AS at
     INNER JOIN lesson AS l ON l.id = at.lesson_id
     INNER JOIN module AS m ON m.id = l.module_id
     INNER JOIN course AS c ON c.id = m.course_id
     INNER JOIN discipline AS d ON d.id = c.discipline_id
     INNER JOIN teacher AS t ON t.id = c.teacher_id
     INNER JOIN users AS u ON u.id = t.user_id
     WHERE at.student_id = ?
     GROUP BY c.id, d.name, u.last_name, u.first_name, u.patronymic
     ORDER BY d.name`,
    [studentId]
  );

  const recent = await query(
    `SELECT id, activity_type, description, created_at
     FROM activity WHERE student_id = ?
     ORDER BY created_at DESC, id DESC LIMIT 5`,
    [studentId]
  );

  res.json({
    coursesCount: Number(courses.count),
    averageGrade: average.value === null ? 0 : Number(Number(average.value).toFixed(2)),
    activeAssignments: Number(active.count),
    attendance: attendanceRows.map(row => ({
      courseId: row.course_id,
      discipline: row.discipline,
      teacher: fullName(row),
      total: Number(row.total),
      present: Number(row.present),
      percent: Math.round((Number(row.present) / Number(row.total)) * 100)
    })),
    recent: recent.map(row => ({
      id: row.id,
      type: row.activity_type,
      description: row.description,
      createdAt: row.created_at
    }))
  });
}));

// ===== Мои курсы =====
router.get('/student/courses', handle(async (req, res) => {
  const { groupId } = req.user;

  const courses = await query(
    `SELECT c.id, c.description, d.name AS discipline, u.last_name, u.first_name, u.patronymic
     FROM course AS c
     INNER JOIN course_group AS cg ON cg.course_id = c.id AND cg.group_id = ?
     INNER JOIN discipline AS d ON d.id = c.discipline_id
     INNER JOIN teacher AS t ON t.id = c.teacher_id
     INNER JOIN users AS u ON u.id = t.user_id
     ORDER BY d.name`,
    [groupId]
  );

  const ids = courses.map(c => c.id);
  let modules = [];
  let lessons = [];
  if (ids.length > 0) {
    modules = await query(
      `SELECT id, course_id, name FROM module WHERE course_id IN (${placeholders(ids)}) ORDER BY id`,
      ids
    );
    // занятия, открытые для группы студента
    lessons = await query(
      `SELECT m.course_id, l.status
       FROM lesson AS l
       INNER JOIN module AS m ON m.id = l.module_id
       INNER JOIN lesson_group AS lg ON lg.lesson_id = l.id AND lg.group_id = ?
       WHERE m.course_id IN (${placeholders(ids)})`,
      [groupId, ...ids]
    );
  }

  res.json({
    courses: courses.map(course => {
      const courseLessons = lessons.filter(l => l.course_id === course.id);
      const completed = courseLessons.filter(l => l.status === 'completed').length;
      return {
        id: course.id,
        discipline: course.discipline,
        description: course.description,
        teacher: fullName(course),
        modules: modules.filter(m => m.course_id === course.id).map(m => m.name),
        lessonsTotal: courseLessons.length,
        lessonsCompleted: completed,
        progress: courseLessons.length > 0 ? Math.round((completed / courseLessons.length) * 100) : 0
      };
    })
  });
}));

// ===== Один курс: модули, занятия, задания =====
router.get('/student/courses/:id', handle(async (req, res) => {
  const { groupId, studentId } = req.user;
  const course = await getMyCourse(req.params.id, groupId);

  const modules = await query('SELECT id, name FROM module WHERE course_id = ? ORDER BY id', [course.id]);
  const lessons = await query(
    `SELECT l.id, l.module_id, l.title, l.lesson_type, l.lesson_date, l.time_slot, l.room,
            l.topics, l.duration, l.status,
            (SELECT COUNT(*) FROM lesson_view AS v WHERE v.lesson_id = l.id AND v.student_id = ?) AS viewed
     FROM lesson AS l
     INNER JOIN module AS m ON m.id = l.module_id
     INNER JOIN lesson_group AS lg ON lg.lesson_id = l.id AND lg.group_id = ?
     WHERE m.course_id = ?
     ORDER BY l.lesson_date, l.time_slot`,
    [studentId, groupId, course.id]
  );
  const files = await loadFiles('lesson_file', 'lesson_id', lessons.map(l => l.id));

  res.json({
    course: {
      id: course.id,
      discipline: course.discipline,
      description: course.description,
      teacher: fullName(course)
    },
    modules,
    lessons: lessons.map(l => ({
      id: l.id,
      moduleId: l.module_id,
      title: l.title,
      type: l.lesson_type,
      date: l.lesson_date,
      slot: l.time_slot,
      room: l.room,
      topics: l.topics,
      duration: l.duration,
      status: l.status,
      viewed: Number(l.viewed) > 0,
      // материалы закрытого занятия студенту не показываются
      files: l.status === 'pending' ? [] : (files[l.id] || [])
    }))
  });
}));

// отметка "занятие просмотрено" (для последних действий и прогресса)
router.post('/student/lessons/:id/view', handle(async (req, res) => {
  const { groupId, studentId } = req.user;
  if (!isId(req.params.id)) throw new AppError(400, 'Некорректное занятие');

  const rows = await query(
    `SELECT l.id, l.title, l.status, d.name AS discipline
     FROM lesson AS l
     INNER JOIN lesson_group AS lg ON lg.lesson_id = l.id AND lg.group_id = ?
     INNER JOIN module AS m ON m.id = l.module_id
     INNER JOIN course AS c ON c.id = m.course_id
     INNER JOIN discipline AS d ON d.id = c.discipline_id
     WHERE l.id = ?`,
    [groupId, req.params.id]
  );
  if (rows.length === 0) throw new AppError(404, 'Занятие не найдено');
  if (rows[0].status === 'pending') throw new AppError(400, 'Занятие еще не открыто преподавателем');

  const viewed = await query('SELECT 1 FROM lesson_view WHERE student_id = ? AND lesson_id = ?', [studentId, rows[0].id]);
  if (viewed.length === 0) {
    await transaction(async (run) => {
      await run('INSERT INTO lesson_view (student_id, lesson_id, viewed_at) VALUES (?, ?, ?)', [studentId, rows[0].id, now()]);
      await addActivity(run, studentId, 'lesson_view', `Просмотрено занятие «${rows[0].title}» (${rows[0].discipline})`);
    });
  }
  res.json({ message: 'Занятие отмечено как просмотренное' });
}));

// ===== Задания =====
router.get('/student/assignments', handle(async (req, res) => {
  const { groupId, studentId } = req.user;

  const rows = await query(
    `SELECT a.id, a.title, a.description, a.start_date, a.due_date, a.course_id,
            d.name AS discipline, t.id AS teacher_id, u.last_name, u.first_name, u.patronymic,
            s.id AS submission_id, s.comment AS submission_comment, s.submitted_at,
            s.attachment_id AS submission_file_id, sa.original_name AS submission_file_name
     FROM assignment AS a
     INNER JOIN assignment_group AS ag ON ag.assignment_id = a.id AND ag.group_id = ?
     INNER JOIN course AS c ON c.id = a.course_id
     INNER JOIN discipline AS d ON d.id = c.discipline_id
     INNER JOIN teacher AS t ON t.id = c.teacher_id
     INNER JOIN users AS u ON u.id = t.user_id
     LEFT JOIN submission AS s ON s.assignment_id = a.id AND s.student_id = ?
     LEFT JOIN attachment AS sa ON sa.id = s.attachment_id
     ORDER BY d.name, a.due_date`,
    [groupId, studentId]
  );
  const files = await loadFiles('assignment_file', 'assignment_id', rows.map(r => r.id));

  res.json({
    today: today(),
    assignments: rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      startDate: r.start_date,
      dueDate: r.due_date,
      courseId: r.course_id,
      discipline: r.discipline,
      teacherId: r.teacher_id,
      teacher: fullName(r),
      files: files[r.id] || [],
      submission: r.submission_id
        ? {
            comment: r.submission_comment,
            submittedAt: r.submitted_at,
            file: r.submission_file_id ? { id: r.submission_file_id, name: r.submission_file_name } : null
          }
        : null
    }))
  });
}));

// отправка работы по заданию (повторная отправка заменяет предыдущую)
router.post('/student/assignments/:id/submit', handle(async (req, res) => {
  const { groupId, studentId, id: userId } = req.user;
  if (!isId(req.params.id)) throw new AppError(400, 'Некорректное задание');

  const rows = await query(
    `SELECT a.id, a.title, a.start_date, a.due_date
     FROM assignment AS a
     INNER JOIN assignment_group AS ag ON ag.assignment_id = a.id AND ag.group_id = ?
     WHERE a.id = ?`,
    [groupId, req.params.id]
  );
  if (rows.length === 0) throw new AppError(404, 'Задание не найдено');
  const assignment = rows[0];

  if (assignment.start_date > today()) throw new AppError(400, 'Задание еще недоступно');
  if (assignment.due_date < today()) throw new AppError(400, 'Срок сдачи задания прошел');

  const comment = text(req.body.comment);
  if (!comment && !req.body.file) {
    throw new AppError(400, 'Добавьте комментарий или прикрепите файл');
  }

  await transaction(async (run) => {
    const fileId = req.body.file ? await saveFile(run, req.body.file, userId) : null;
    await run('DELETE FROM submission WHERE assignment_id = ? AND student_id = ?', [assignment.id, studentId]);
    await run(
      'INSERT INTO submission (assignment_id, student_id, comment, attachment_id, submitted_at) VALUES (?, ?, ?, ?, ?)',
      [assignment.id, studentId, comment || null, fileId, now()]
    );
    await addActivity(run, studentId, 'submission', `Отправлена работа «${assignment.title}»`);
  });

  res.json({ message: 'Работа отправлена' });
}));

// ===== Оценки =====
router.get('/student/grades', handle(async (req, res) => {
  const rows = await query(
    `SELECT g.id, g.course_id, g.grade_type, g.grade_value, g.grade_date, g.comment,
            d.name AS discipline, u.last_name, u.first_name, u.patronymic
     FROM grade AS g
     INNER JOIN course AS c ON c.id = g.course_id
     INNER JOIN discipline AS d ON d.id = c.discipline_id
     INNER JOIN teacher AS t ON t.id = c.teacher_id
     INNER JOIN users AS u ON u.id = t.user_id
     WHERE g.student_id = ?
     ORDER BY d.name, g.grade_date, g.id`,
    [req.user.studentId]
  );

  // оценки группируются по курсам
  const courses = [];
  rows.forEach(row => {
    let course = courses.find(c => c.courseId === row.course_id);
    if (!course) {
      course = {
        courseId: row.course_id,
        discipline: row.discipline,
        teacher: fullName(row),
        control: [],
        independent: [],
        laboratory: [],
        board: [],
        final: null
      };
      courses.push(course);
    }
    const grade = { id: row.id, value: row.grade_value, date: row.grade_date, comment: row.comment };
    if (row.grade_type === 'final') course.final = grade;
    else course[row.grade_type].push(grade);
  });

  const finals = courses.filter(c => c.final).map(c => c.final.value);
  res.json({
    courses,
    averageFinal: finals.length > 0 ? Number((finals.reduce((s, v) => s + v, 0) / finals.length).toFixed(2)) : 0
  });
}));

// ===== Расписание группы на период =====
router.get('/student/schedule', handle(async (req, res) => {
  const { from, to } = req.query;
  if (!isDate(from) || !isDate(to)) throw new AppError(400, 'Некорректный период');

  const rows = await query(
    `SELECT l.id, l.title, l.lesson_type, l.lesson_date, l.time_slot, l.room, l.status,
            d.name AS discipline, u.last_name, u.first_name, u.patronymic
     FROM lesson AS l
     INNER JOIN lesson_group AS lg ON lg.lesson_id = l.id AND lg.group_id = ?
     INNER JOIN module AS m ON m.id = l.module_id
     INNER JOIN course AS c ON c.id = m.course_id
     INNER JOIN discipline AS d ON d.id = c.discipline_id
     INNER JOIN teacher AS t ON t.id = c.teacher_id
     INNER JOIN users AS u ON u.id = t.user_id
     WHERE l.lesson_date BETWEEN ? AND ?
     ORDER BY l.lesson_date, l.time_slot`,
    [req.user.groupId, from, to]
  );

  res.json({
    lessons: rows.map(r => ({
      id: r.id,
      title: r.title,
      type: r.lesson_type,
      date: r.lesson_date,
      slot: r.time_slot,
      room: r.room,
      status: r.status,
      discipline: r.discipline,
      teacher: fullName(r)
    }))
  });
}));

module.exports = router;
