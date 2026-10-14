import { Link } from 'react-router-dom';
import http, { errorText } from '../../api/http';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, Loader, StatCard, useLoad } from '../../components/Common';
import ErrorMessage from '../../components/ErrorMessage';
import { ACTIVITY_ICONS } from '../../utils/constants';
import { formatDateTime } from '../../utils/dates';

// Главная страница студента
function StudentHome() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad(() => http.get('/student/dashboard').then((r) => r.data));

  return (
    <>
      <section className="hero-card">
        <h1 className="hero-title">Привет, {user.firstName} 👋</h1>
        <p className="hero-text">Добро пожаловать в ZachioBook - здесь собраны ваши курсы, задания, оценки и расписание.</p>
        <div className="hero-chips">
          <span className="hero-chip">🎓 Студент</span>
          <span className="hero-chip">👥 Группа {user.groupName}</span>
          <span className="hero-chip">📚 Курсов: {data ? data.coursesCount : '…'}</span>
          <span className="hero-chip">⭐ Средний балл: {data ? data.averageGrade : '…'}</span>
        </div>
      </section>

      {loading && !data && <Loader />}
      {error && <ErrorMessage text={errorText(error)} onRetry={reload} />}

      {data && (
        <>
          <div className="stats-grid">
            <StatCard icon="📚" value={data.coursesCount} label="Курсов по расписанию группы" color="purple" />
            <StatCard icon="⭐" value={data.averageGrade} label="Средний балл (по финальным оценкам)" color="orange" />
            <StatCard icon="📝" value={data.activeAssignments} label="Активных заданий" color="green" />
          </div>

          <div className="two-columns">
            <section className="card">
              <h2 className="card-title">✔️ Посещаемость</h2>
              {data.attendance.length === 0 ? (
                <EmptyState icon="🗓️" title="Отметок пока нет" text="Посещаемость появится, когда преподаватели отметят занятия." />
              ) : (
                <div className="attendance-list">
                  {data.attendance.map((item) => (
                    <div key={item.courseId} className="attendance-item">
                      <div className="attendance-head">
                        <div>
                          <div className="strong">{item.discipline}</div>
                          <div className="muted small">{item.teacher}</div>
                        </div>
                        <div className={`percent ${item.percent >= 75 ? 'good' : item.percent >= 50 ? 'mid' : 'bad'}`}>
                          {item.percent}%
                        </div>
                      </div>
                      <div className="progress">
                        <div className="progress-bar" style={{ width: `${item.percent}%` }} />
                      </div>
                      <div className="muted small">Посещено {item.present} из {item.total}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card">
              <h2 className="card-title">🕒 Последние действия</h2>
              {data.recent.length === 0 ? (
                <EmptyState icon="✨" title="Пока пусто" text="Здесь появятся просмотренные занятия, отправленные работы, оценки, отметки и ответы преподавателей." />
              ) : (
                <ul className="activity-list">
                  {data.recent.map((item) => (
                    <li key={item.id}>
                      <span className="activity-icon">{ACTIVITY_ICONS[item.type] || '•'}</span>
                      <div>
                        <div>{item.description}</div>
                        <div className="muted small">{formatDateTime(item.createdAt)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {data.coursesCount === 0 && (
            <EmptyState icon="📚" title="Вы пока не записаны ни на один курс" text="Курсы появятся, когда преподаватель добавит вашу группу в свою дисциплину.">
              <Link to="/student/courses" className="btn btn-primary">Перейти к курсам</Link>
            </EmptyState>
          )}
        </>
      )}
    </>
  );
}

export default StudentHome;
