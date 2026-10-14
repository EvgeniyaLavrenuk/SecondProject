import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import http from '../api/http';
import ConfirmModal from './ConfirmModal';
import { Loader } from './Common';

const STUDENT_LINKS = [
  { to: '/student', label: 'Главная', icon: '🏠', end: true },
  { to: '/student/courses', label: 'Мои курсы', icon: '📚' },
  { to: '/student/assignments', label: 'Задания', icon: '📝' },
  { to: '/student/grades', label: 'Оценки', icon: '⭐' },
  { to: '/student/schedule', label: 'Расписание', icon: '📅' },
  { to: '/student/messages', label: 'Сообщения', icon: '💬', messages: true }
];

const TEACHER_LINKS = [
  { to: '/teacher', label: 'Главная', icon: '🏠', end: true },
  { to: '/teacher/disciplines', label: 'Дисциплины', icon: '🎓' },
  { to: '/teacher/lessons', label: 'Занятия', icon: '📚' },
  { to: '/teacher/grades', label: 'Оценки', icon: '⭐' },
  { to: '/teacher/schedule', label: 'Расписание', icon: '📅' },
  { to: '/teacher/messages', label: 'Сообщения', icon: '💬', messages: true }
];

// событие для обновления счетчика непрочитанных сообщений в шапке
export const notifyMessagesChanged = () => window.dispatchEvent(new Event('messages-changed'));

// декоративные размытые фигуры на фоне (лежат под всем содержимым)
export function Background() {
  return (
    <div className="bg-shapes" aria-hidden="true">
      <div className="bg-shape shape-1" />
      <div className="bg-shape shape-2" />
      <div className="bg-shape shape-3" />
    </div>
  );
}

function Header({ links }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const loadUnread = useCallback(() => {
    http.get('/messages/unread')
      .then((response) => setUnread(response.data.unread))
      .catch(() => {});
  }, []);

  // счетчик обновляется при переходах, по событию и раз в 30 секунд
  useEffect(() => {
    loadUnread();
    setMenuOpen(false);
  }, [location.pathname, loadUnread]);

  useEffect(() => {
    window.addEventListener('messages-changed', loadUnread);
    const timer = setInterval(loadUnread, 30000);
    return () => {
      window.removeEventListener('messages-changed', loadUnread);
      clearInterval(timer);
    };
  }, [loadUnread]);

  const initials = `${user.lastName?.[0] || ''}${user.firstName?.[0] || ''}`;

  return (
    <header className="app-header">
      <div className="header-inner">
        <NavLink to={links[0].to} className="logo">
          <span className="logo-icon">📚</span>
          <span className="logo-text">
            <span className="logo-primary">Zachio</span>
            <span className="logo-secondary">Book</span>
          </span>
        </NavLink>

        <button type="button" className="menu-toggle" onClick={() => setMenuOpen((v) => !v)} aria-label="Меню">
          ☰
        </button>

        <nav className={`nav ${menuOpen ? 'open' : ''}`}>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className="nav-pill">
              <span className="nav-icon">{link.icon}</span>
              <span>{link.label}</span>
              {link.messages && unread > 0 && <span className="nav-badge">{unread}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="user-box">
          <div className="avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name">{user.lastName} {user.firstName}</div>
            <div className="user-role">
              {user.role === 'student' ? `🎓 Студент · ${user.groupName}` : '👨‍🏫 Преподаватель'}
            </div>
          </div>
          <button type="button" className="logout-btn" onClick={() => setConfirmLogout(true)}>🚪 Выход</button>
        </div>
      </div>

      <ConfirmModal
        open={confirmLogout}
        title="Выход из системы"
        text="Завершить сеанс? Токен входа будет отозван, для продолжения работы потребуется снова войти."
        confirmText="Выйти"
        onConfirm={logout}
        onClose={() => setConfirmLogout(false)}
      />
    </header>
  );
}

// Защищенная часть сайта: только для вошедших пользователей нужной роли
export function ProtectedLayout({ role }) {
  const { user, checking } = useAuth();

  if (checking) {
    return (
      <div className="app">
        <Background />
        <Loader text="Проверка входа…" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'student' ? '/student' : '/teacher'} replace />;

  return (
    <div className="app">
      <Background />
      <Header links={role === 'student' ? STUDENT_LINKS : TEACHER_LINKS} />
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
