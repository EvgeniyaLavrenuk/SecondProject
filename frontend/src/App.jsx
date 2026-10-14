import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ProtectedLayout } from './components/Layout';
import AuthPage from './pages/AuthPage';
import Messenger from './pages/Messenger';

import StudentHome from './pages/student/StudentHome';
import StudentCourses from './pages/student/StudentCourses';
import StudentCourse from './pages/student/StudentCourse';
import StudentAssignments from './pages/student/StudentAssignments';
import StudentGrades from './pages/student/StudentGrades';
import StudentSchedule from './pages/student/StudentSchedule';

import TeacherHome from './pages/teacher/TeacherHome';
import TeacherDisciplines from './pages/teacher/TeacherDisciplines';
import TeacherLessons from './pages/teacher/TeacherLessons';
import TeacherGrades from './pages/teacher/TeacherGrades';
import TeacherSchedule from './pages/teacher/TeacherSchedule';

// стартовая страница: вошедший пользователь попадает в свой кабинет
function StartRedirect() {
  const { user, checking } = useAuth();
  if (checking) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'student' ? '/student' : '/teacher'} replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<StartRedirect />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      <Route path="/student" element={<ProtectedLayout role="student" />}>
        <Route index element={<StudentHome />} />
        <Route path="courses" element={<StudentCourses />} />
        <Route path="courses/:id" element={<StudentCourse />} />
        <Route path="assignments" element={<StudentAssignments />} />
        <Route path="grades" element={<StudentGrades />} />
        <Route path="schedule" element={<StudentSchedule />} />
        <Route path="messages" element={<Messenger />} />
      </Route>

      <Route path="/teacher" element={<ProtectedLayout role="teacher" />}>
        <Route index element={<TeacherHome />} />
        <Route path="disciplines" element={<TeacherDisciplines />} />
        <Route path="lessons" element={<TeacherLessons />} />
        <Route path="grades" element={<TeacherGrades />} />
        <Route path="schedule" element={<TeacherSchedule />} />
        <Route path="messages" element={<Messenger />} />
      </Route>

      <Route path="*" element={<StartRedirect />} />
    </Routes>
  );
}

export default App;
