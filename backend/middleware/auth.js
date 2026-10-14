const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db');
const { AppError, hoursFromNow, fullName } = require('../utils/helpers');

const SECRET = process.env.JWT_SECRET || 'zachio-book-secret-key-change-me';
const TOKEN_HOURS = Number(process.env.TOKEN_HOURS) || 12;

// профиль пользователя: роль, ФИО, группа (для студента) или id преподавателя
const getProfile = async (userId) => {
  const rows = await query(
    `SELECT u.id, u.email, u.role, u.last_name, u.first_name, u.patronymic,
            s.id AS student_id, s.group_id, g.name AS group_name,
            t.id AS teacher_id
     FROM users AS u
     LEFT JOIN student AS s ON s.user_id = u.id
     LEFT JOIN student_group AS g ON g.id = s.group_id
     LEFT JOIN teacher AS t ON t.user_id = u.id
     WHERE u.id = ?`,
    [userId]
  );
  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    lastName: row.last_name,
    firstName: row.first_name,
    patronymic: row.patronymic,
    fullName: fullName(row),
    studentId: row.student_id,
    groupId: row.group_id,
    groupName: row.group_name,
    teacherId: row.teacher_id
  };
};

// выдача токена: в таблицу user_session записывается сессия с уникальным id токена
const createToken = async (userId, role) => {
  const tokenId = crypto.randomBytes(24).toString('hex');
  await query(
    'INSERT INTO user_session (user_id, token_id, expires_at) VALUES (?, ?, ?)',
    [userId, tokenId, hoursFromNow(TOKEN_HOURS)]
  );
  return jwt.sign({ userId, role, tokenId }, SECRET, { expiresIn: `${TOKEN_HOURS}h` });
};

// проверка токена: подпись, срок действия и то, что сессия не отозвана (выход из ЛК)
const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      throw new AppError(401, 'Требуется вход в систему');
    }

    let payload;
    try {
      payload = jwt.verify(header.slice(7), SECRET);
    } catch (error) {
      throw new AppError(401, 'Сессия истекла, войдите снова');
    }

    const sessions = await query(
      'SELECT id FROM user_session WHERE token_id = ? AND revoked_at IS NULL AND expires_at > ?',
      [payload.tokenId, hoursFromNow(0)]
    );
    if (sessions.length === 0) {
      throw new AppError(401, 'Сессия завершена, войдите снова');
    }

    const user = await getProfile(payload.userId);
    if (!user) {
      throw new AppError(401, 'Пользователь не найден');
    }

    req.user = user;
    req.tokenId = payload.tokenId;
    next();
  } catch (error) {
    next(error);
  }
};

// проверка роли (student / teacher)
const requireRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    return next(new AppError(403, 'Нет доступа к этому разделу'));
  }
  next();
};

module.exports = { requireAuth, requireRole, createToken, getProfile };
