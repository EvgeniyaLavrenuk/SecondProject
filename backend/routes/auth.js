const express = require('express');
const bcrypt = require('bcryptjs');
const { query, transaction } = require('../db');
const { requireAuth, createToken, getProfile } = require('../middleware/auth');
const { AppError, handle, isId, text, now } = require('../utils/helpers');

const router = express.Router();
const TEACHER_CODE = process.env.TEACHER_CODE || 'TEACHER2024';

// список групп (нужен на странице регистрации, поэтому без входа)
router.get('/groups', handle(async (req, res) => {
  const groups = await query('SELECT id, name FROM student_group ORDER BY name');
  res.json({ groups });
}));

// регистрация студента или преподавателя
router.post('/auth/register', handle(async (req, res) => {
  const role = req.body.role;
  const lastName = text(req.body.lastName);
  const firstName = text(req.body.firstName);
  const patronymic = text(req.body.patronymic);
  const email = text(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const groupId = req.body.groupId;

  if (!['student', 'teacher'].includes(role)) {
    throw new AppError(400, 'Выберите роль');
  }
  if (!lastName || !firstName || !email || !password) {
    throw new AppError(400, 'Заполните все обязательные поля');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, 'Некорректный email');
  }
  // пароль: не короче 8 символов и хотя бы 3 вида символов из 5
  // (строчные, заглавные буквы, цифры, спецсимволы и сама длина)
  const passed = [/[a-zа-я]/, /[A-ZА-Я]/, /\d/, /[^a-zA-Zа-яА-Я0-9]/].filter(rule => rule.test(password)).length + 1;
  if (password.length < 8 || passed < 3) {
    throw new AppError(400, 'Пароль слишком простой: нужно не меньше 8 символов, буквы и цифры или спецсимволы');
  }
  if (password !== req.body.passwordRepeat) {
    throw new AppError(400, 'Пароли не совпадают');
  }
  if (role === 'teacher' && text(req.body.teacherCode) !== TEACHER_CODE) {
    throw new AppError(400, 'Неверный код преподавателя');
  }
  if (role === 'student') {
    if (!isId(groupId)) {
      throw new AppError(400, 'Выберите группу');
    }
    const groups = await query('SELECT id FROM student_group WHERE id = ?', [groupId]);
    if (groups.length === 0) {
      throw new AppError(400, 'Группа не найдена');
    }
  }

  const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    throw new AppError(400, 'Пользователь с таким email уже зарегистрирован');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // учетная запись + запись студента или преподавателя
  const userId = await transaction(async (run) => {
    const result = await run(
      `INSERT INTO users (email, password_hash, role, last_name, first_name, patronymic, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [email, passwordHash, role, lastName, firstName, patronymic || null, now()]
    );
    if (role === 'student') {
      await run('INSERT INTO student (user_id, group_id) VALUES (?, ?)', [result.insertId, groupId]);
    } else {
      await run('INSERT INTO teacher (user_id) VALUES (?)', [result.insertId]);
    }
    return result.insertId;
  });

  // после регистрации пользователь сразу входит в систему
  const token = await createToken(userId, role);
  res.status(201).json({ token, user: await getProfile(userId) });
}));

// вход
router.post('/auth/login', handle(async (req, res) => {
  const email = text(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    throw new AppError(400, 'Введите email и пароль');
  }

  const users = await query('SELECT id, role, password_hash FROM users WHERE email = ?', [email]);
  if (users.length === 0 || !(await bcrypt.compare(password, users[0].password_hash))) {
    throw new AppError(401, 'Неверный email или пароль');
  }

  const token = await createToken(users[0].id, users[0].role);
  res.json({ token, user: await getProfile(users[0].id) });
}));

// выход: сессия токена отзывается, токен больше не принимается сервером
router.post('/auth/logout', requireAuth, handle(async (req, res) => {
  await query('UPDATE user_session SET revoked_at = ? WHERE token_id = ?', [now(), req.tokenId]);
  res.json({ message: 'Вы вышли из системы' });
}));

// текущий пользователь (проверка токена при открытии сайта)
router.get('/auth/me', requireAuth, handle(async (req, res) => {
  res.json({ user: req.user });
}));

module.exports = router;
