import { Link } from 'react-router-dom';
import http, { errorText } from '../../api/http';
import { EmptyState, Loader, PageTitle, useLoad } from '../../components/Common';
import ErrorMessage from '../../components/ErrorMessage';

// Мои курсы: курсы, на которые записана группа студента
function StudentCourses() {
  const { data, error, loading, reload } = useLoad(() => http.get('/student/courses').then((r) => r.data.courses));

  return (
    <>
      <PageTitle icon="📚" title="Мои курсы" subtitle="Курсы, на которые преподаватели записали вашу группу" />

      {loading && !data && <Loader />}
      {error && <ErrorMessage text={errorText(error)} onRetry={reload} />}

      {data && data.length === 0 && (
        <EmptyState icon="📭" title="Курсов пока нет" text="Как только преподаватель добавит вашу группу в дисциплину, курс появится здесь." />
      )}

      {data && data.length > 0 && (
        <div className="course-grid">
          {data.map((course) => (
            <div key={course.id} className="course-card">
              <div className="course-card-top">
                <h3>{course.discipline}</h3>
                <div className="muted">👨‍🏫 {course.teacher}</div>
              </div>
              <p className="course-desc">{course.description || 'Описание курса пока не добавлено.'}</p>

              <div className="course-modules">
                <div className="small strong">Блоки обучения:</div>
                {course.modules.length === 0 ? (
                  <span className="muted small">модули еще не добавлены</span>
                ) : (
                  <div className="chips">
                    {course.modules.map((name, index) => <span key={index} className="chip">{index + 1}. {name}</span>)}
                  </div>
                )}
              </div>

              <div className="course-progress">
                <div className="small muted">Завершено занятий: {course.lessonsCompleted} из {course.lessonsTotal}</div>
                <div className="progress"><div className="progress-bar" style={{ width: `${course.progress}%` }} /></div>
              </div>

              <Link to={`/student/courses/${course.id}`} className="btn btn-primary btn-block">Открыть курс</Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default StudentCourses;
