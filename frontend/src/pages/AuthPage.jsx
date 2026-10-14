import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import http, { errorText } from '../api/http';
import ErrorMessage from '../components/ErrorMessage';
import { Background } from '../components/Layout';
import PasswordStrength, { passwordLevel } from '../components/PasswordStrength';

const EMPTY_FORM = {
  role: 'student',
  lastName: '',
  firstName: '',
  patronymic: '',
  email: '',
  password: '',
  password2: '',
  groupId: '',
  teacherCode: ''
};

// Страница входа и регистрации
function AuthPage({ mode }) {
  const { user, checking, login, register } = useAuth();
  const navigate = useNavigate();
  const isLogin = mode === 'login';

  const [form, setForm] = useState(EMPTY_FORM);
  const [groups, setGroups] = useState([]);
  const [groupsError, setGroupsError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // список групп нужен только при регистрации
  useEffect(() => {
    setError('');
    if (isLogin) return;
    http.get('/groups')
      .then((response) => setGroups(response.data.groups))
      .catch((err) => setGroupsError(errorText(err)));
  }, [isLogin]);

  if (checking) return null;
  if (user) return <Navigate to={user.role === 'student' ? '/student' : '/teacher'} replace />;

  const passwordsMatch = form.password === form.password2;
  // кнопка регистрации недоступна, пока пароль слабый или повтор не совпадает
  const registerBlocked = !isLogin && (passwordLevel(form.password) < 2 || !passwordsMatch);

  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    if (!isLogin) {
      if (passwordLevel(form.password) < 2) {
        setError('Пароль слишком простой: нужно не меньше 8 символов и хотя бы 3 требования из списка');
        return;
      }
      if (form.password !== form.password2) {
        setError('Пароли не совпадают');
        return;
      }
    }

    setBusy(true);
    try {
      const logged = isLogin
        ? await login(form.email, form.password)
        : await register({
            role: form.role,
            lastName: form.lastName,
            firstName: form.firstName,
            patronymic: form.patronymic,
            email: form.email,
            password: form.password,
            passwordRepeat: form.password2,
            groupId: form.role === 'student' ? Number(form.groupId) : undefined,
            teacherCode: form.role === 'teacher' ? form.teacherCode : undefined
          });
      navigate(logged.role === 'student' ? '/student' : '/teacher', { replace: true });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <Background />
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-icon">📚</span>
          <span className="auth-logo-text">Zachio<span>Book</span></span>
        </div>
        <h2>{isLogin ? 'Вход в личный кабинет' : 'Регистрация'}</h2>
        <p className="muted center">
          {isLogin ? 'Электронная зачетная книжка для студентов и преподавателей' : 'Создайте учетную запись студента или преподавателя'}
        </p>

        <form onSubmit={submit} className="form">
          {!isLogin && (
            <>
              <div className="role-switch">
                {[['student', '🎓 Студент'], ['teacher', '👨‍🏫 Преподаватель']].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={form.role === value ? 'active' : ''}
                    onClick={() => setForm({ ...form, role: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="form-row">
                <label>Фамилия *<input name="lastName" value={form.lastName} onChange={change} required /></label>
                <label>Имя *<input name="firstName" value={form.firstName} onChange={change} required /></label>
              </div>
              <label>Отчество<input name="patronymic" value={form.patronymic} onChange={change} /></label>
              {form.role === 'student' ? (
                <label>
                  Группа *
                  <select name="groupId" value={form.groupId} onChange={change} required>
                    <option value="">Выберите группу</option>
                    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                  {groupsError && <span className="field-error">{groupsError}</span>}
                </label>
              ) : (
                <label>
                  Код преподавателя *
                  <input name="teacherCode" value={form.teacherCode} onChange={change} required placeholder="Выдается учебной частью" />
                </label>
              )}
            </>
          )}

          <label>Email *<input type="email" name="email" value={form.email} onChange={change} required autoComplete="username" /></label>
          <label>
            Пароль *
            <input type="password" name="password" value={form.password} onChange={change} required autoComplete={isLogin ? 'current-password' : 'new-password'} />
          </label>
          {!isLogin && <PasswordStrength password={form.password} />}
          {!isLogin && (
            <label>
              Повторите пароль *
              <input
                type="password"
                name="password2"
                value={form.password2}
                onChange={change}
                required
                autoComplete="new-password"
                className={form.password2 ? (passwordsMatch ? 'input-ok' : 'input-error') : ''}
              />
              {form.password2 && (
                <span className={passwordsMatch ? 'field-ok' : 'field-error'}>
                  {passwordsMatch ? '✔ Пароли совпадают' : '✖ Пароли не совпадают'}
                </span>
              )}
            </label>
          )}

          <ErrorMessage text={error} />

          <button type="submit" className="btn btn-primary btn-block" disabled={busy || registerBlocked}>
            {busy ? 'Подождите…' : isLogin ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </form>

        <p className="center auth-switch">
          {isLogin ? (
            <>Нет учетной записи? <Link to="/register">Зарегистрироваться</Link></>
          ) : (
            <>Уже есть учетная запись? <Link to="/login">Войти</Link></>
          )}
        </p>
      </div>
    </div>
  );
}

export default AuthPage;
