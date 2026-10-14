const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AppError } = require('./helpers');

// папка для загруженных файлов
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
// максимальный размер одного файла - 10 МБ
const MAX_SIZE = 10 * 1024 * 1024;

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// сохранение файла, присланного с фронтенда в виде { name, type, data (base64) }
// файл записывается в папку uploads, информация о нем - в таблицу attachment
// run - функция выполнения запроса (обычная или внутри транзакции)
const saveFile = async (run, file, userId) => {
  if (!file || !file.name || !file.data) {
    throw new AppError(400, 'Некорректный файл');
  }

  const buffer = Buffer.from(file.data, 'base64');
  if (buffer.length === 0) {
    throw new AppError(400, `Файл «${file.name}» пустой`);
  }
  if (buffer.length > MAX_SIZE) {
    throw new AppError(400, `Файл «${file.name}» больше 10 МБ`);
  }

  // имя на диске: случайная строка + расширение исходного файла
  const extension = path.extname(file.name).slice(0, 20);
  const storedName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buffer);

  const result = await run(
    `INSERT INTO attachment (original_name, stored_name, mime_type, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?)`,
    [String(file.name).slice(0, 255), storedName, file.type || 'application/octet-stream', buffer.length, userId]
  );
  return result.insertId;
};

// сохранение нескольких файлов, возвращает массив id
const saveFiles = async (run, files, userId) => {
  const ids = [];
  for (const file of Array.isArray(files) ? files : []) {
    ids.push(await saveFile(run, file, userId));
  }
  return ids;
};

module.exports = { UPLOAD_DIR, saveFile, saveFiles };
