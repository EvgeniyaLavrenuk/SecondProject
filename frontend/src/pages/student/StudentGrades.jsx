import http, { errorText } from '../../api/http';
import { EmptyState, Loader, PageTitle, StatCard, useLoad } from '../../components/Common';
import ErrorMessage from '../../components/ErrorMessage';
import { GRADE_TYPES } from '../../utils/constants';
import { formatDate } from '../../utils/dates';

const TYPES = ['control', 'independent', 'laboratory', 'board'];

// цвет оценки
const gradeClass = (value) => (value >= 5 ? 'g5' : value === 4 ? 'g4' : value === 3 ? 'g3' : 'g2');

// Оценки студента по дисциплинам
function StudentGrades() {
  const { data, error, loading, reload } = useLoad(() => http.get('/student/grades').then((r) => r.data));

  return (
    <>
      <PageTitle icon="⭐" title="Мои оценки" subtitle="Средний балл считается только по финальным оценкам" />
      {loading && !data && <Loader />}
      {error && <ErrorMessage text={errorText(error)} onRetry={reload} />}

      {data && (
        <>
          <div className="stats-grid">
            <StatCard icon="⭐" value={data.averageFinal} label="Средний балл" color="orange" />
            <StatCard icon="📘" value={data.courses.length} label="Дисциплин с оценками" color="purple" />
            <StatCard icon="🏁" value={data.courses.filter((c) => c.final).length} label="Финальных оценок" color="green" />
          </div>

          {data.courses.length === 0 && (
            <EmptyState icon="📊" title="Оценок пока нет" text="Оценки появятся здесь, когда преподаватель выставит их в журнал." />
          )}

          <div className="grades-grid">
            {data.courses.map((course) => (
              <section key={course.courseId} className="card grade-card">
                <div className="grade-card-head">
                  <div>
                    <h3>{course.discipline}</h3>
                    <div className="muted small">👨‍🏫 {course.teacher}</div>
                  </div>
                  <div className="final-box">
                    <div className="small muted">Финальная</div>
                    {course.final ? (
                      <div className={`final-value ${gradeClass(course.final.value)}`} title={formatDate(course.final.date)}>
                        {course.final.value}
                      </div>
                    ) : (
                      <div className="final-value empty">-</div>
                    )}
                  </div>
                </div>
                <table className="grade-table">
                  <tbody>
                    {TYPES.map((type) => (
                      <tr key={type}>
                        <td className="muted">{GRADE_TYPES[type]}</td>
                        <td>
                          {course[type].length === 0 ? (
                            <span className="muted small">нет оценок</span>
                          ) : (
                            course[type].map((grade) => (
                              <span
                                key={grade.id}
                                className={`grade-pill ${gradeClass(grade.value)}`}
                                title={`${formatDate(grade.date)}${grade.comment ? ` - ${grade.comment}` : ''}`}
                              >
                                {grade.value}
                              </span>
                            ))
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export default StudentGrades;
