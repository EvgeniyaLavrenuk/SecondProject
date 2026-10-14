const mysql = require('mysql2/promise');

// пул подключений к MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'zachio_book',
  connectionLimit: 10,
  // даты приходят строками 'ГГГГ-ММ-ДД' / 'ГГГГ-ММ-ДД ЧЧ:ММ:СС', а не объектами Date
  dateStrings: true
});

// выполнение запроса: возвращает строки результата (или информацию о вставке/изменении)
const query = async (sql, params = []) => {
  const [result] = await pool.query(sql, params);
  return result;
};

// выполнение нескольких запросов в одной транзакции
// callback получает функцию run(sql, params) для запросов внутри транзакции
const transaction = async (callback) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const run = async (sql, params = []) => {
      const [result] = await connection.query(sql, params);
      return result;
    };
    const value = await callback(run);
    await connection.commit();
    return value;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// проверка подключения при запуске сервера
const checkConnection = async () => {
  await query('SELECT 1');
};

module.exports = { query, transaction, checkConnection };
