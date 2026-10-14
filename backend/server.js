require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { checkConnection } = require('./db');

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const teacherRoutes = require('./routes/teacher');
const messageRoutes = require('./routes/messages');
const fileRoutes = require('./routes/files');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// разрешены запросы с фронтенда на localhost с любым портом (5173, 5174 и т.д.)
app.use(cors({ origin: /^http:\/\/localhost:\d+$/ }));
// файлы приходят в теле запроса в base64, поэтому лимит увеличен
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api', authRoutes);
app.use('/api', studentRoutes);
app.use('/api', teacherRoutes);
app.use('/api', messageRoutes);
app.use('/api', fileRoutes);

// неизвестный адрес
app.use((req, res) => {
  res.status(404).json({ message: 'Адрес не найден' });
});

// общий обработчик ошибок: текст ошибки уходит на фронтенд в поле message
app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Файл слишком большой' });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Некорректные данные запроса' });
  }
  if (error.status) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error(error);
  res.status(500).json({ message: 'Ошибка сервера. Попробуйте еще раз' });
});

checkConnection()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Сервер запущен: http://localhost:${PORT}`);
      console.log('Подключение к базе данных установлено');
    });
  })
  .catch((error) => {
    console.error('Не удалось подключиться к базе данных:', error.message);
    console.error('Проверьте, что MySQL запущен и параметры в файле .env указаны верно');
    process.exit(1);
  });
