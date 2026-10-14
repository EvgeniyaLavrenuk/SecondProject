const express = require('express');
const { query, transaction } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { saveFiles } = require('../utils/files');
const {
  AppError, handle, isId, isDate, today, now, fullName, placeholders, text,
  LESSON_TYPES, LESSON_STATUSES, GRADE_TYPES, GRADE_TYPE_NAMES
} = require('../utils/helpers');

const router = express.Router();
router.use('/teacher', requireAuth, requireRole('teacher'));

// ===== Вспомогательные функции =====

// запись в "последние действия" студента
const addActivity = async (run, studentId, type, description) => {
  await run(
    'INSERT INTO activity (student_id, activity_type, description, created_at) VALUES (?, ?, ?, ?)',
    [studentId, type, description.slice(0, 255), now()]
  );
};

// курс преподавателя (иначе 404)
const getMyCourse = async (courseId, teacherId) => {
  if (!isId(courseId)) throw new AppError(400, 'Некорректный курс');
  const rows = await query(
    `SELECT c.id, c.description, c.discipline_id, d.name AS discipline, d.created_by_teacher_id
     FROM course AS c
     INNER JOIN discipline AS d ON d.id = c.discipline_id
     WHERE c.id = ? AND c.teacher_id = ?`,
    [courseId, teacherId]
  );
  if (rows.length === 0) throw new AppError(404, 'Курс не найден');
  return rows[0];
};

// группы, записанные на курс
const getCourseGroupIds = async (courseId) =>
  (await query('SELECT group_id FROM course_group WHERE course_id = ?', [courseId])).map(r => r.group_id);

// проверка списка групп: не пустой и все группы записаны на курс
const checkGroups = (groupIds, courseGroupIds) => {
  if (!Array.isArray(groupIds) || groupIds.length === 0) {
    throw new AppError(400, 'Выберите хотя бы одну группу');
  }
  const ids = groupIds.map(Number);
  if (ids.some(id => !courseGroupIds.includes(id))) {
    throw new AppError(400, 'Группа не записана на этот курс');
  }
  return [...new Set(ids)];
};

// занятие преподавателя (иначе 404)
const getMyLesson = async (lessonId, teacherId) => {
  if (!isId(lessonId)) throw new AppError(400, 'Некорректное занятие');
  const rows = await query(
    `SELECT l.id, l.title, l.status, l.lesson_date, m.course_id, d.name AS discipline
     FROM lesson AS l
     INNER JOIN module AS m ON m.id = l.module_id
     INNER JOIN course AS c ON c.id = m.course_id
     INNER JOIN discipline AS d ON d.id = c.discipline_id
     WHERE l.id = ? AND c.teacher_id = ?`,
    [lessonId, teacherId]
  );
  if (rows.length === 0) throw new AppError(404, 'Занятие не найдено');
  return rows[0];
};

// задание преподавателя (иначе 404)
const getMyAssignment = async (assignmentId, teacherId) => {
  if (!isId(assignmentId)) throw new AppError(400, 'Некорректное задание');
  const rows = await query(
    `SELECT a.id, a.title, a.start_date, a.due_date, a.course_id
     FROM assignment AS a
     INNER JOIN course AS c ON c.id = a.course_id
     WHERE a.id = ? AND c.teacher_id = ?`,
    [assignmentId, teacherId]
  );
  if (rows.length === 0) throw new AppError(404, 'Задание не найдено');
  return rows[0];
};

// файлы для списка id занятий / заданий
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

// группы для списка id занятий / заданий: { id: [ {id, name} ] }
const loadGroups = async (table, column, ids) => {
  const map = {};
  if (ids.length === 0) return map;
  const rows = await query(
    `SELECT x.${column} AS owner_id, g.id, g.name
     FROM ${table} AS x
     INNER JOIN student_group AS g ON g.id = x.group_id
     WHERE x.${column} IN (${placeholders(ids)})
     ORDER BY g.name`,
    ids
  );
  rows.forEach(row => {
    if (!map[row.owner_id]) map[row.owner_id] = [];
    map[row.owner_id].push({ id: row.id, name: row.name });
  });
  return map;
};

// есть ли уже дисциплина с таким названием (без учета регистра)
const nameTaken = async (name, exceptId = 0) => {
  const rows = await query('SELECT id, name FROM discipline WHERE id <> ?', [exceptId]);
  return rows.some(row => row.name.toLowerCase() === name.toLowerCase());
};

// ===== Главная страница =====
router.get('/teacher/dashboard', handle(async (req, res) => {
  const teacherId = req.user.teacherId;

  const courses = await query(
    `SELECT c.id, c.description, d.id AS discipline_id, d.name AS discipline, d.created_by_teacher_id,
            (SELECT COUNT(*) FROM course AS o WHERE o.discipline_id = d.id AND o.teacher_id <> c.teacher_id) AS others,
            (SELECT COUNT(*) FROM module AS m WHERE m.course_id = c.id) AS modules_count,
            (SELECT COUNT(*) FROM lesson AS l INNER JOIN module AS m ON m.id = l.module_id WHERE m.course_id = c.id) AS lessons_count,
            (SELECT COUNT(*) FROM assignment AS a WHERE a.course_id = c.id) AS assignments_count
     FROM course AS c
     INNER JOIN discipline AS d ON d.id = c.discipline_id
     WHERE c.teacher_id = ?
     ORDER BY d.name`,
    [teacherId]
  );

  // группы курсов с количеством студентов
  const groupRows = courses.length === 0 ? [] : await query(
    `SELECT cg.course_id, g.id, g.name,
            (SELECT COUNT(*) FROM student AS s WHERE s.group_id = g.id) AS students
     FROM course_group AS cg
     INNER JOIN student_group AS g ON g.id = cg.group_id
     WHERE cg.course_id IN (${placeholders(courses.map(c => c.id))})
     ORDER BY g.name`,
    courses.map(c => c.id)
  );

  // статистика по группам: средняя финальная оценка и посещаемость на занятиях преподавателя
  const groupIds = [...new Set(groupRows.map(g => g.id))];
  const groupStats = [];
  for (const groupId of groupIds) {
    const group = groupRows.find(g => g.id === groupId);
    const [finals] = await query(
      `SELECT AVG(gr.grade_value) AS avg_final, COUNT(*) AS count
       FROM grade AS gr
       INNER JOIN student AS s ON s.id = gr.student_id
       INNER JOIN course AS c ON c.id = gr.course_id
       WHERE s.group_id = ? AND c.teacher_id = ? AND gr.grade_type = 'final'`,
      [groupId, teacherId]
    );
    const [attendance] = await query(
      `SELECT COUNT(*) AS total, SUM(at.is_present) AS present
       FROM attendance AS at
       INNER JOIN student AS s ON s.id = at.student_id
       INNER JOIN lesson AS l ON l.id = at.lesson_id
       INNER JOIN module AS m ON m.id = l.module_id
       INNER JOIN course AS c ON c.id = m.course_id
       WHERE s.group_id = ? AND c.teacher_id = ?`,
      [groupId, teacherId]
    );
    groupStats.push({
      id: groupId,
      name: group.name,
      students: Number(group.students),
      courses: courses.filter(c => groupRows.some(g => g.course_id === c.id && g.id === groupId)).map(c => c.discipline),
      averageFinal: finals.avg_final === null ? null : Number(Number(finals.avg_final).toFixed(2)),
      attendancePercent: Number(attendance.total) > 0
        ? Math.round((Number(attendance.present) / Number(attendance.total)) * 100)
        : null
    });
  }

  // занятия на этой неделе
  const d = new Date();
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const [weekLessons] = await query(
    `SELECT COUNT(*) AS count
     FROM lesson AS l
     INNER JOIN module AS m ON m.id = l.module_id
     INNER JOIN course AS c ON c.id = m.course_id
     WHERE c.teacher_id = ? AND l.lesson_date BETWEEN ? AND ?`,
    [teacherId, fmt(monday), fmt(sunday)]
  );

  const [unread] = await query(
    `SELECT COUNT(*) AS count
     FROM message AS ms
     INNER JOIN conversation AS cv ON cv.id = ms.conversation_id
     WHERE cv.teacher_id = ? AND ms.sender_role = 'student' AND ms.is_read = 0`,
    [teacherId]
  );

  res.json({
    courses: courses.map(c => ({
      id: c.id,
      disciplineId: c.discipline_id,
      discipline: c.discipline,
      description: c.description,
      canRename: Number(c.others) === 0,
      modulesCount: Number(c.modules_count),
      lessonsCount: Number(c.lessons_count),
      assignmentsCount: Number(c.assignments_count),
      groups: groupRows.filter(g => g.course_id === c.id).map(g => ({ id: g.id, name: g.name, students: Number(g.students) })),
      studentsCount: groupRows.filter(g => g.course_id === c.id).reduce((sum, g) => sum + Number(g.students), 0)
    })),
    groups: groupStats,
    totals: {
      courses: courses.length,
      groups: groupStats.length,
      students: groupStats.reduce((sum, g) => sum + g.students, 0),
      weekLessons: Number(weekLessons.count),
      unreadMessages: Number(unread.count)
    }
  });
}));

// ===== Дисциплины =====

// все дисциплины с отметкой "выбрана мной"
router.get('/teacher/disciplines', handle(async (req, res) => {
  const teacherId = req.user.teacherId;
  const rows = await query(
    `SELECT d.id, d.name, d.created_by_teacher_id,
            (SELECT c.id FROM course AS c WHERE c.discipline_id = d.id AND c.teacher_id = ?) AS course_id,
            (SELECT COUNT(*) FROM course AS c WHERE c.discipline_id = d.id AND c.teacher_id <> ?) AS others
     FROM discipline AS d
     ORDER BY d.name`,
    [teacherId, teacherId]
  );
  res.json({
    disciplines: rows.map(r => ({
      id: r.id,
      name: r.name,
      courseId: r.course_id,
      selected: r.course_id !== null,
      createdByMe: r.created_by_teacher_id === teacherId,
      usedByOthers: Number(r.others)
    }))
  });
}));

// новая дисциплина (добавляется в справочник и сразу выбирается)
router.post('/teacher/disciplines', handle(async (req, res) => {
  const teacherId = req.user.teacherId;
  const name = text(req.body.name);
  if (!name) throw new AppError(400, 'Введите название дисциплины');
  if (name.length > 255) throw new AppError(400, 'Слишком длинное название');

  if (await nameTaken(name)) {
    throw new AppError(400, 'Такая дисциплина уже есть в списке - просто выберите ее');
  }

  await transaction(async (run) => {
    const result = await run(
      'INSERT INTO discipline (name, created_by_teacher_id, created_at) VALUES (?, ?, ?)',
      [name, teacherId, now()]
    );
    await run(
      'INSERT INTO course (teacher_id, discipline_id, created_at) VALUES (?, ?, ?)',
      [teacherId, result.insertId, now()]
    );
  });
  res.status(201).json({ message: `Дисциплина «${name}» добавлена` });
}));

// удаление своей дисциплины из справочника (если ее не ведут другие преподаватели)
router.delete('/teacher/disciplines/:id', handle(async (req, res) => {
  const teacherId = req.user.teacherId;
  if (!isId(req.params.id)) throw new AppError(400, 'Некорректная дисциплина');

  const rows = await query('SELECT id, name, created_by_teacher_id FROM discipline WHERE id = ?', [req.params.id]);
  if (rows.length === 0) throw new AppError(404, 'Дисциплина не найдена');
  if (rows[0].created_by_teacher_id !== teacherId) {
    throw new AppError(403, 'Удалить из справочника можно только добавленную вами дисциплину');
  }
  const [others] = await query(
    'SELECT COUNT(*) AS count FROM course WHERE discipline_id = ? AND teacher_id <> ?',
    [rows[0].id, teacherId]
  );
  if (Number(others.count) > 0) {
    throw new AppError(400, 'Эту дисциплину уже ведут другие преподаватели - ее можно только убрать из своих');
  }

  await query('DELETE FROM discipline WHERE id = ?', [rows[0].id]);
  res.json({ message: `Дисциплина «${rows[0].name}» удалена` });
}));

// выбор дисциплины (создание курса)
router.post('/teacher/courses', handle(async (req, res) => {
  const teacherId = req.user.teacherId;
  const disciplineId = req.body.disciplineId;
  if (!isId(disciplineId)) throw new AppError(400, 'Некорректная дисциплина');

  const disciplines = await query('SELECT id FROM discipline WHERE id = ?', [disciplineId]);
  if (disciplines.length === 0) throw new AppError(404, 'Дисциплина не найдена');

  const existing = await query('SELECT id FROM course WHERE teacher_id = ? AND discipline_id = ?', [teacherId, disciplineId]);
  if (existing.length > 0) {
    return res.json({ message: 'Дисциплина уже выбрана', courseId: existing[0].id });
  }

  const result = await query(
    'INSERT INTO course (teacher_id, discipline_id, created_at) VALUES (?, ?, ?)',
    [teacherId, disciplineId, now()]
  );
  res.status(201).json({ message: 'Дисциплина добавлена в ваши', courseId: result.insertId });
}));

// отказ от дисциплины (курс удаляется вместе с модулями, занятиями, заданиями и оценками)
router.delete('/teacher/courses/:id', handle(async (req, res) => {
  const course = await getMyCourse(req.params.id, req.user.teacherId);
  await query('DELETE FROM course WHERE id = ?', [course.id]);
  res.json({ message: `Дисциплина «${course.discipline}» убрана из ваших` });
}));

// изменение названия и описания курса
router.put('/teacher/courses/:id', handle(async (req, res) => {
  const teacherId = req.user.teacherId;
  const course = await getMyCourse(req.params.id, teacherId);
  const name = text(req.body.name);
  const description = text(req.body.description);

  if (!name) throw new AppError(400, 'Введите название дисциплины');

  await transaction(async (run) => {
    if (name !== course.discipline) {
      // название дисциплины общее - менять можно, только если ее ведет лишь этот преподаватель
      const [others] = await query(
        'SELECT COUNT(*) AS count FROM course WHERE discipline_id = ? AND teacher_id <> ?',
        [course.discipline_id, teacherId]
      );
      if (Number(others.count) > 0) {
        throw new AppError(400, 'Эту дисциплину ведут и другие преподаватели - ее название изменить нельзя');
      }
      if (await nameTaken(name, course.discipline_id)) throw new AppError(400, 'Дисциплина с таким названием уже есть');
      await run('UPDATE discipline SET name = ? WHERE id = ?', [name, course.discipline_id]);
    }
    await run('UPDATE course SET description = ? WHERE id = ?', [description || null, course.id]);
  });
  res.json({ message: 'Изменения сохранены' });
}));

// ===== Группы курса =====

router.get('/teacher/groups', handle(async (req, res) => {
  const groups = await query(
    `SELECT g.id, g.name, (SELECT COUNT(*) FROM student AS s WHERE s.group_id = g.id) AS students
     FROM student_group AS g ORDER BY g.name`
  );
  res.json({ groups: groups.map(g => ({ id: g.id, name: g.name, students: Number(g.students) })) });
}));

// запись групп на курс (полный список); у убранных групп пропадает доступ к занятиям и заданиям курса
router.put('/teacher/courses/:id/groups', handle(async (req, res) => {
  const course = await getMyCourse(req.params.id, req.user.teacherId);
  const groupIds = Array.isArray(req.body.groupIds) ? [...new Set(req.body.groupIds.map(Number))] : null;
  if (!groupIds || groupIds.some(id => !isId(id))) throw new AppError(400, 'Некорректный список групп');

  if (groupIds.length > 0) {
    const found = await query(`SELECT id FROM student_group WHERE id IN (${placeholders(groupIds)})`, groupIds);
    if (found.length !== groupIds.length) throw new AppError(400, 'Группа не найдена');
  }

  const current = await getCourseGroupIds(course.id);
  const removed = current.filter(id => !groupIds.includes(id));
  const added = groupIds.filter(id => !current.includes(id));

  await transaction(async (run) => {
    for (const groupId of removed) {
      await run('DELETE FROM course_group WHERE course_id = ? AND group_id = ?', [course.id, groupId]);
      await run(
        `DELETE FROM lesson_group WHERE group_id = ? AND lesson_id IN
           (SELECT l.id FROM lesson AS l INNER JOIN module AS m ON m.id = l.module_id WHERE m.course_id = ?)`,
        [groupId, course.id]
      );
      await run(
        'DELETE FROM assignment_group WHERE group_id = ? AND assignment_id IN (SELECT a.id FROM assignment AS a WHERE a.course_id = ?)',
        [groupId, course.id]
      );
    }
    for (const groupId of added) {
      await run('INSERT INTO course_group (course_id, group_id) VALUES (?, ?)', [course.id, groupId]);
    }
  });
  res.json({ message: 'Группы курса сохранены' });
}));

// ===== Курс: модули, занятия, задания =====
router.get('/teacher/courses/:id', handle(async (req, res) => {
  const course = await getMyCourse(req.params.id, req.user.teacherId);

  const groups = await query(
    `SELECT g.id, g.name, (SELECT COUNT(*) FROM student AS s WHERE s.group_id = g.id) AS students
     FROM course_group AS cg INNER JOIN student_group AS g ON g.id = cg.group_id
     WHERE cg.course_id = ? ORDER BY g.name`,
    [course.id]
  );
  const modules = await query('SELECT id, name FROM module WHERE course_id = ? ORDER BY id', [course.id]);
  const lessons = await query(
    `SELECT l.id, l.module_id, l.title, l.lesson_type, l.lesson_date, l.time_slot, l.room, l.topics, l.duration, l.status
     FROM lesson AS l INNER JOIN module AS m ON m.id = l.module_id
     WHERE m.course_id = ?
     ORDER BY l.lesson_date, l.time_slot`,
    [course.id]
  );
  const assignments = await query(
    `SELECT a.id, a.title, a.description, a.start_date, a.due_date,
            (SELECT COUNT(*) FROM submission AS s WHERE s.assignment_id = a.id) AS submissions
     FROM assignment AS a WHERE a.course_id = ?
     ORDER BY a.due_date`,
    [course.id]
  );

  const lessonIds = lessons.map(l => l.id);
  const assignmentIds = assignments.map(a => a.id);
  const [others] = await query(
    'SELECT COUNT(*) AS count FROM course WHERE discipline_id = ? AND teacher_id <> ?',
    [course.discipline_id, req.user.teacherId]
  );
  const lessonFiles = await loadFiles('lesson_file', 'lesson_id', lessonIds);
  const lessonGroups = await loadGroups('lesson_group', 'lesson_id', lessonIds);
  const assignmentFiles = await loadFiles('assignment_file', 'assignment_id', assignmentIds);
  const assignmentGroups = await loadGroups('assignment_group', 'assignment_id', assignmentIds);

  res.json({
    course: {
      id: course.id,
      discipline: course.discipline,
      description: course.description,
      canRename: Number(others.count) === 0
    },
    groups: groups.map(g => ({ id: g.id, name: g.name, students: Number(g.students) })),
    stats: {
      students: groups.reduce((sum, g) => sum + Number(g.students), 0),
      lessons: lessons.length,
      modules: modules.length
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
      groups: lessonGroups[l.id] || [],
      files: lessonFiles[l.id] || []
    })),
    assignments: assignments.map(a => ({
      id: a.id,
      title: a.title,
      description: a.description,
      startDate: a.start_date,
      dueDate: a.due_date,
      submissions: Number(a.submissions),
      groups: assignmentGroups[a.id] || [],
      files: assignmentFiles[a.id] || []
    }))
  });
}));

// модули
router.post('/teacher/courses/:id/modules', handle(async (req, res) => {
  const course = await getMyCourse(req.params.id, req.user.teacherId);
  const name = text(req.body.name);
  if (!name) throw new AppError(400, 'Введите название модуля');
  await query('INSERT INTO module (course_id, name) VALUES (?, ?)', [course.id, name.slice(0, 255)]);
  res.status(201).json({ message: 'Модуль добавлен' });
}));

const getMyModule = async (moduleId, teacherId) => {
  if (!isId(moduleId)) throw new AppError(400, 'Некорректный модуль');
  const rows = await query(
    `SELECT m.id, m.name, m.course_id FROM module AS m
     INNER JOIN course AS c ON c.id = m.course_id
     WHERE m.id = ? AND c.teacher_id = ?`,
    [moduleId, teacherId]
  );
  if (rows.length === 0) throw new AppError(404, 'Модуль не найден');
  return rows[0];
};

router.put('/teacher/modules/:id', handle(async (req, res) => {
  const module = await getMyModule(req.params.id, req.user.teacherId);
  const name = text(req.body.name);
  if (!name) throw new AppError(400, 'Введите название модуля');
  await query('UPDATE module SET name = ? WHERE id = ?', [name.slice(0, 255), module.id]);
  res.json({ message: 'Модуль переименован' });
}));

router.delete('/teacher/modules/:id', handle(async (req, res) => {
  const module = await getMyModule(req.params.id, req.user.teacherId);
  await query('DELETE FROM module WHERE id = ?', [module.id]);
  res.json({ message: `Модуль «${module.name}» удален` });
}));

// новое занятие
router.post('/teacher/courses/:id/lessons', handle(async (req, res) => {
  const teacherId = req.user.teacherId;
  const course = await getMyCourse(req.params.id, teacherId);
  const { moduleId, type, date, slot } = req.body;
  const title = text(req.body.title);
  const room = text(req.body.room);

  const module = await getMyModule(moduleId, teacherId);
  if (module.course_id !== course.id) throw new AppError(400, 'Модуль не относится к этому курсу');
  if (!title) throw new AppError(400, 'Введите название занятия');
  if (!LESSON_TYPES.includes(type)) throw new AppError(400, 'Выберите тип занятия');
  if (!isDate(date)) throw new AppError(400, 'Выберите дату занятия');
  if (!Number.isInteger(Number(slot)) || Number(slot) < 1 || Number(slot) > 6) throw new AppError(400, 'Выберите время занятия');
  if (!room) throw new AppError(400, 'Укажите кабинет');

  const groupIds = checkGroups(req.body.groupIds, await getCourseGroupIds(course.id));

  // у группы не должно быть другого занятия в это время
  const groupBusy = await query(
    `SELECT g.name FROM lesson AS l
     INNER JOIN lesson_group AS lg ON lg.lesson_id = l.id
     INNER JOIN student_group AS g ON g.id = lg.group_id
     WHERE l.lesson_date = ? AND l.time_slot = ? AND lg.group_id IN (${placeholders(groupIds)})`,
    [date, Number(slot), ...groupIds]
  );
  if (groupBusy.length > 0) {
    throw new AppError(400, `У группы ${groupBusy[0].name} в это время уже есть занятие`);
  }
  // и у преподавателя тоже
  const teacherBusy = await query(
    `SELECT l.id FROM lesson AS l
     INNER JOIN module AS m ON m.id = l.module_id
     INNER JOIN course AS c ON c.id = m.course_id
     WHERE c.teacher_id = ? AND l.lesson_date = ? AND l.time_slot = ?`,
    [teacherId, date, Number(slot)]
  );
  if (teacherBusy.length > 0) throw new AppError(400, 'У вас в это время уже есть занятие');

  await transaction(async (run) => {
    const result = await run(
      `INSERT INTO lesson (module_id, title, lesson_type, lesson_date, time_slot, room, topics, duration, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [module.id, title.slice(0, 255), type, date, Number(slot), room.slice(0, 50),
        text(req.body.topics) || null, text(req.body.duration).slice(0, 50) || null, now()]
    );
    for (const groupId of groupIds) {
      await run('INSERT INTO lesson_group (lesson_id, group_id) VALUES (?, ?)', [result.insertId, groupId]);
    }
    const fileIds = await saveFiles(run, req.body.files, req.user.id);
    for (const fileId of fileIds) {
      await run('INSERT INTO lesson_file (lesson_id, attachment_id) VALUES (?, ?)', [result.insertId, fileId]);
    }
  });
  res.status(201).json({ message: 'Занятие добавлено' });
}));

// открыть / закрыть / завершить занятие
router.put('/teacher/lessons/:id/status', handle(async (req, res) => {
  const lesson = await getMyLesson(req.params.id, req.user.teacherId);
  if (!LESSON_STATUSES.includes(req.body.status)) throw new AppError(400, 'Некорректный статус');
  // завершить можно только занятие, которое уже прошло (или идет сегодня)
  if (req.body.status === 'completed' && lesson.lesson_date > today()) {
    throw new AppError(400, 'Занятие еще не прошло - завершить его можно в день занятия или позже');
  }
  await query('UPDATE lesson SET status = ? WHERE id = ?', [req.body.status, lesson.id]);
  res.json({ message: 'Статус занятия изменен' });
}));

router.delete('/teacher/lessons/:id', handle(async (req, res) => {
  const lesson = await getMyLesson(req.params.id, req.user.teacherId);
  await query('DELETE FROM lesson WHERE id = ?', [lesson.id]);
  res.json({ message: `Занятие «${lesson.title}» удалено` });
}));

// новое задание
router.post('/teacher/courses/:id/assignments', handle(async (req, res) => {
  const course = await getMyCourse(req.params.id, req.user.teacherId);
  const title = text(req.body.title);
  const { startDate, dueDate } = req.body;

  if (!title) throw new AppError(400, 'Введите название задания');
  if (!isDate(startDate) || !isDate(dueDate)) throw new AppError(400, 'Укажите даты начала и окончания');
  if (startDate < today()) throw new AppError(400, 'Дата начала не может быть в прошлом');
  if (dueDate < startDate) throw new AppError(400, 'Срок сдачи не может быть раньше даты начала');

  const groupIds = checkGroups(req.body.groupIds, await getCourseGroupIds(course.id));

  await transaction(async (run) => {
    const result = await run(
      'INSERT INTO assignment (course_id, title, description, start_date, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [course.id, title.slice(0, 255), text(req.body.description) || null, startDate, dueDate, now()]
    );
    for (const groupId of groupIds) {
      await run('INSERT INTO assignment_group (assignment_id, group_id) VALUES (?, ?)', [result.insertId, groupId]);
    }
    const fileIds = await saveFiles(run, req.body.files, req.user.id);
    for (const fileId of fileIds) {
      await run('INSERT INTO assignment_file (assignment_id, attachment_id) VALUES (?, ?)', [result.insertId, fileId]);
    }
  });
  res.status(201).json({ message: 'Задание добавлено' });
}));

// изменение сроков задания
router.put('/teacher/assignments/:id/deadline', handle(async (req, res) => {
  const assignment = await getMyAssignment(req.params.id, req.user.teacherId);
  const { startDate, dueDate } = req.body;

  if (!isDate(startDate) || !isDate(dueDate)) throw new AppError(400, 'Укажите даты начала и окончания');
  if (startDate !== assignment.start_date && startDate < today()) {
    throw new AppError(400, 'Дата начала не может быть в прошлом');
  }
  if (dueDate < today()) throw new AppError(400, 'Срок сдачи не может быть в прошлом');
  if (dueDate < startDate) throw new AppError(400, 'Срок сдачи не может быть раньше даты начала');

  await query('UPDATE assignment SET start_date = ?, due_date = ? WHERE id = ?', [startDate, dueDate, assignment.id]);
  res.json({ message: 'Сроки задания изменены' });
}));

router.delete('/teacher/assignments/:id', handle(async (req, res) => {
  const assignment = await getMyAssignment(req.params.id, req.user.teacherId);
  await query('DELETE FROM assignment WHERE id = ?', [assignment.id]);
  res.json({ message: `Задание «${assignment.title}» удалено` });
}));

// сданные работы по заданию: все студенты групп задания и их отправки
router.get('/teacher/assignments/:id/submissions', handle(async (req, res) => {
  const assignment = await getMyAssignment(req.params.id, req.user.teacherId);
  const rows = await query(
    `SELECT st.id AS student_id, u.last_name, u.first_name, u.patronymic, g.name AS group_name,
            s.comment, s.submitted_at, s.attachment_id, a.original_name
     FROM assignment_group AS ag
     INNER JOIN student AS st ON st.group_id = ag.group_id
     INNER JOIN users AS u ON u.id = st.user_id
     INNER JOIN student_group AS g ON g.id = st.group_id
     LEFT JOIN submission AS s ON s.assignment_id = ag.assignment_id AND s.student_id = st.id
     LEFT JOIN attachment AS a ON a.id = s.attachment_id
     WHERE ag.assignment_id = ?
     ORDER BY g.name, u.last_name, u.first_name`,
    [assignment.id]
  );
  res.json({
    assignment: { id: assignment.id, title: assignment.title, dueDate: assignment.due_date },
    students: rows.map(r => ({
      studentId: r.student_id,
      name: fullName(r),
      group: r.group_name,
      submitted: r.submitted_at !== null,
      comment: r.comment,
      submittedAt: r.submitted_at,
      file: r.attachment_id ? { id: r.attachment_id, name: r.original_name } : null
    }))
  });
}));

// ===== Оценки и посещаемость =====

// группы, записанные на курсы преподавателя (для окна выбора группы)
router.get('/teacher/journal-groups', handle(async (req, res) => {
  const rows = await query(
    `SELECT g.id, g.name, c.id AS course_id, d.name AS discipline,
            (SELECT COUNT(*) FROM student AS s WHERE s.group_id = g.id) AS students
     FROM course AS c
     INNER JOIN course_group AS cg ON cg.course_id = c.id
     INNER JOIN student_group AS g ON g.id = cg.group_id
     INNER JOIN discipline AS d ON d.id = c.discipline_id
     WHERE c.teacher_id = ?
     ORDER BY g.name, d.name`,
    [req.user.teacherId]
  );
  const groups = [];
  rows.forEach(r => {
    let group = groups.find(g => g.id === r.id);
    if (!group) {
      group = { id: r.id, name: r.name, students: Number(r.students), courses: [] };
      groups.push(group);
    }
    group.courses.push({ id: r.course_id, discipline: r.discipline });
  });
  res.json({ groups });
}));

// журнал: студенты группы, их оценки по курсу, занятия курса у группы и отметки посещаемости
router.get('/teacher/journal', handle(async (req, res) => {
  const course = await getMyCourse(req.query.courseId, req.user.teacherId);
  const groupId = Number(req.query.groupId);
  if (!(await getCourseGroupIds(course.id)).includes(groupId)) {
    throw new AppError(400, 'Группа не записана на этот курс');
  }

  const students = await query(
    `SELECT st.id, u.last_name, u.first_name, u.patronymic, u.email
     FROM student AS st INNER JOIN users AS u ON u.id = st.user_id
     WHERE st.group_id = ?
     ORDER BY u.last_name, u.first_name`,
    [groupId]
  );
  const grades = await query(
    `SELECT gr.id, gr.student_id, gr.grade_type, gr.grade_value, gr.grade_date, gr.comment
     FROM grade AS gr INNER JOIN student AS st ON st.id = gr.student_id
     WHERE gr.course_id = ? AND st.group_id = ?
     ORDER BY gr.grade_date, gr.id`,
    [course.id, groupId]
  );
  const lessons = await query(
    `SELECT l.id, l.title, l.lesson_type, l.lesson_date, l.time_slot, l.status
     FROM lesson AS l
     INNER JOIN module AS m ON m.id = l.module_id
     INNER JOIN lesson_group AS lg ON lg.lesson_id = l.id AND lg.group_id = ?
     WHERE m.course_id = ?
     ORDER BY l.lesson_date, l.time_slot`,
    [groupId, course.id]
  );
  const marks = lessons.length === 0 ? [] : await query(
    `SELECT lesson_id, student_id, is_present FROM attendance WHERE lesson_id IN (${placeholders(lessons.map(l => l.id))})`,
    lessons.map(l => l.id)
  );

  res.json({
    course: { id: course.id, discipline: course.discipline },
    students: students.map(s => {
      const studentMarks = marks.filter(m => m.student_id === s.id);
      const present = studentMarks.filter(m => m.is_present === 1).length;
      return {
        id: s.id,
        name: fullName(s),
        email: s.email,
        attendance: {
          total: studentMarks.length,
          present,
          percent: studentMarks.length > 0 ? Math.round((present / studentMarks.length) * 100) : null
        }
      };
    }),
    grades: grades.map(g => ({
      id: g.id, studentId: g.student_id, type: g.grade_type, value: g.grade_value, date: g.grade_date, comment: g.comment
    })),
    lessons: lessons.map(l => ({
      id: l.id, title: l.title, type: l.lesson_type, date: l.lesson_date, slot: l.time_slot, status: l.status
    })),
    attendance: marks.map(m => ({ lessonId: m.lesson_id, studentId: m.student_id, present: m.is_present === 1 }))
  });
}));

// выставление оценки (финальная оценка одна - новая заменяет старую)
router.post('/teacher/grades', handle(async (req, res) => {
  const course = await getMyCourse(req.body.courseId, req.user.teacherId);
  const { studentId, type } = req.body;
  const value = Number(req.body.value);

  if (!GRADE_TYPES.includes(type)) throw new AppError(400, 'Выберите тип оценки');
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new AppError(400, 'Оценка должна быть от 1 до 5');
  if (!isId(studentId)) throw new AppError(400, 'Некорректный студент');

  const students = await query(
    `SELECT st.id FROM student AS st
     INNER JOIN course_group AS cg ON cg.group_id = st.group_id AND cg.course_id = ?
     WHERE st.id = ?`,
    [course.id, studentId]
  );
  if (students.length === 0) throw new AppError(400, 'Студент не записан на этот курс');

  // финальная оценка ставится по итогам текущих оценок, без них она не имеет смысла
  if (type === 'final') {
    const [current] = await query(
      "SELECT COUNT(*) AS count FROM grade WHERE student_id = ? AND course_id = ? AND grade_type <> 'final'",
      [studentId, course.id]
    );
    if (Number(current.count) === 0) {
      throw new AppError(400, 'У студента нет текущих оценок по курсу - финальную оценку ставить пока не за что');
    }
  }

  await transaction(async (run) => {
    if (type === 'final') {
      await run("DELETE FROM grade WHERE student_id = ? AND course_id = ? AND grade_type = 'final'", [studentId, course.id]);
    }
    await run(
      'INSERT INTO grade (student_id, course_id, grade_type, grade_value, grade_date, comment) VALUES (?, ?, ?, ?, ?, ?)',
      [studentId, course.id, type, value, today(), text(req.body.comment).slice(0, 255) || null]
    );
    await addActivity(run, Number(studentId), 'grade',
      `Получена оценка ${value} (${GRADE_TYPE_NAMES[type]}) по курсу «${course.discipline}»`);
  });
  res.status(201).json({ message: 'Оценка сохранена' });
}));

router.delete('/teacher/grades/:id', handle(async (req, res) => {
  if (!isId(req.params.id)) throw new AppError(400, 'Некорректная оценка');
  const rows = await query(
    `SELECT gr.id FROM grade AS gr INNER JOIN course AS c ON c.id = gr.course_id
     WHERE gr.id = ? AND c.teacher_id = ?`,
    [req.params.id, req.user.teacherId]
  );
  if (rows.length === 0) throw new AppError(404, 'Оценка не найдена');
  await query('DELETE FROM grade WHERE id = ?', [rows[0].id]);
  res.json({ message: 'Оценка удалена' });
}));

// сохранение отметок посещаемости занятия
router.put('/teacher/attendance', handle(async (req, res) => {
  const lesson = await getMyLesson(req.body.lessonId, req.user.teacherId);
  const marks = Array.isArray(req.body.marks) ? req.body.marks : [];
  if (marks.length === 0) throw new AppError(400, 'Нет отметок для сохранения');
  if (lesson.lesson_date > today()) {
    throw new AppError(400, 'Занятие еще не прошло - посещаемость отмечается в день занятия или позже');
  }

  // отмечать можно только студентов групп этого занятия
  const allowed = (await query(
    `SELECT st.id FROM student AS st
     INNER JOIN lesson_group AS lg ON lg.group_id = st.group_id AND lg.lesson_id = ?`,
    [lesson.id]
  )).map(r => r.id);
  if (marks.some(m => !allowed.includes(Number(m.studentId)))) {
    throw new AppError(400, 'Студент не относится к группам этого занятия');
  }

  await transaction(async (run) => {
    for (const mark of marks) {
      const studentId = Number(mark.studentId);
      const present = mark.present ? 1 : 0;
      const old = await run('SELECT is_present FROM attendance WHERE lesson_id = ? AND student_id = ?', [lesson.id, studentId]);
      if (old.length > 0 && old[0].is_present === present) continue;

      await run('DELETE FROM attendance WHERE lesson_id = ? AND student_id = ?', [lesson.id, studentId]);
      await run(
        'INSERT INTO attendance (lesson_id, student_id, is_present, marked_at) VALUES (?, ?, ?, ?)',
        [lesson.id, studentId, present, now()]
      );
      await addActivity(run, studentId, 'attendance',
        `${present ? 'Отмечено присутствие' : 'Отмечен пропуск'} на занятии «${lesson.title}» (${lesson.discipline})`);
    }
  });
  res.json({ message: 'Посещаемость сохранена' });
}));

// ===== Расписание преподавателя =====
router.get('/teacher/schedule', handle(async (req, res) => {
  const { from, to, courseId, groupId } = req.query;
  if (!isDate(from) || !isDate(to)) throw new AppError(400, 'Некорректный период');

  const params = [req.user.teacherId, from, to];
  let filter = '';
  if (isId(courseId)) {
    filter += ' AND c.id = ?';
    params.push(Number(courseId));
  }
  if (isId(groupId)) {
    filter += ' AND EXISTS (SELECT 1 FROM lesson_group AS x WHERE x.lesson_id = l.id AND x.group_id = ?)';
    params.push(Number(groupId));
  }

  const lessons = await query(
    `SELECT l.id, l.title, l.lesson_type, l.lesson_date, l.time_slot, l.room, l.status,
            c.id AS course_id, d.name AS discipline
     FROM lesson AS l
     INNER JOIN module AS m ON m.id = l.module_id
     INNER JOIN course AS c ON c.id = m.course_id
     INNER JOIN discipline AS d ON d.id = c.discipline_id
     WHERE c.teacher_id = ? AND l.lesson_date BETWEEN ? AND ?${filter}
     ORDER BY l.lesson_date, l.time_slot`,
    params
  );
  const groups = await loadGroups('lesson_group', 'lesson_id', lessons.map(l => l.id));

  res.json({
    lessons: lessons.map(l => ({
      id: l.id,
      title: l.title,
      type: l.lesson_type,
      date: l.lesson_date,
      slot: l.time_slot,
      room: l.room,
      status: l.status,
      courseId: l.course_id,
      discipline: l.discipline,
      groups: groups[l.id] || []
    }))
  });
}));

module.exports = router;
