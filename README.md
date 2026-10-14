# Zachio Book - электронная зачетная книжка

Проект из трех частей:

- `database/zachio_book.sql` - скрипт базы данных MySQL (для DBeaver);
- `backend/` - сервер на Node.js + Express (порт 3000);
- `frontend/` - клиент на React + Vite (порт 5173).

## Запуск

1. **База данных.** В DBeaver подключиться к MySQL, открыть `database/zachio_book.sql` и выполнить весь скрипт (Alt + X).
   Создается база `zachio_book` с тестовыми пользователями. Даты занятий и заданий считаются от дня запуска скрипта.
2. **Бэкенд.** В файле `backend/.env` указать свой пароль MySQL в `DB_PASSWORD`. Затем:
   ```
   cd backend
   npm install
   npm start
   ```
3. **Фронтенд.** Во втором терминале:
   ```
   cd frontend
   npm install
   npm run dev
   ```

## Учетные записи

Пароль всех студентов: `Student123!`, всех преподавателей: `Teacher123!`.

| Роль | ФИО | Группа | Email |
|---|---|---|---|
| Студент | Куриш Стефания Тарасовна | 02361-ДБ | kurish.s@zachio.ru |
| Студент | Лавренюк Евгения Олеговна | 02361-ДБ | lavrenyuk.e@zachio.ru |
| Студент | Сидоров Иван Сергеевич | 02361-ДБ | sidorov.i@zachio.ru |
| Студент | Иванова Анна Петровна | 02361-ДБ | ivanova.a@zachio.ru |
| Студент | Кузнецов Дмитрий Андреевич | 02361-ДБ | kuznetsov.d@zachio.ru |
| Студент | Непомнещий Алексей Михайлович | 02362-ДБ | nepomneshchiy.a@zachio.ru |
| Студент | Лапачидзе Алексей Романович | 02362-ДБ | lapachidze.a@zachio.ru |
| Студент | Смирнова Мария Олеговна | 02362-ДБ | smirnova.m@zachio.ru |
| Студент | Волков Артем Игоревич | 02362-ДБ | volkov.a@zachio.ru |
| Студент | Морозова Елена Викторовна | 02363-ДБ | morozova.e@zachio.ru |
| Студент | Новиков Павел Сергеевич | 02363-ДБ | novikov.p@zachio.ru |
| Студент | Федорова Ольга Дмитриевна | 02363-ДБ | fedorova.o@zachio.ru |
| Преподаватель | Попова Виктория Алексеевна | - | popova.v@zachio.ru |
| Преподаватель | Рябец Леонид Владимирович | - | ryabets.l@zachio.ru |
| Преподаватель | Тюрнева Татьяна Геннадьевна | - | tyurneva.t@zachio.ru |
| Преподаватель | Петров Иван Иванович | - | petrov.i@zachio.ru |

Код для регистрации нового преподавателя: `TEACHER2024` 

## Таблицы базы данных

users, user_session, student_group, student, teacher, discipline, course, course_group, module, lesson,
lesson_group, lesson_file, lesson_view, attachment, assignment, assignment_group, assignment_file, submission,
grade, attendance, conversation, message, activity.
