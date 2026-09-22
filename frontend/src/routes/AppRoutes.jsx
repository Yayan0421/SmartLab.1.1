import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute, { PublicOnlyRoute } from './ProtectedRoute.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import Spinner from '../components/Spinner.jsx';
import NotFound from '../pages/NotFound.jsx';

import Login from '../pages/auth/Login.jsx';
import Register from '../pages/auth/Register.jsx';
import AdminLogin from '../pages/auth/AdminLogin.jsx';
import AdminRegister from '../pages/auth/AdminRegister.jsx';
const Kiosk = lazy(() => import('../pages/kiosk/Kiosk.jsx'));

import AdminLayout from '../layouts/AdminLayout.jsx';
import FacultyLayout from '../layouts/FacultyLayout.jsx';
import StudentLayout from '../layouts/StudentLayout.jsx';

// The admin screens carry the charting library and the heaviest tables, so
// they load on demand rather than in the bundle every student downloads.
const AdminDashboard = lazy(() => import('../pages/admin/Dashboard.jsx'));
const AdminUsers = lazy(() => import('../pages/admin/Users.jsx'));
const AdminComputers = lazy(() => import('../pages/admin/Computers.jsx'));
const AdminBookings = lazy(() => import('../pages/admin/Bookings.jsx'));
const AdminMonitoring = lazy(() => import('../pages/admin/Monitoring.jsx'));
const AdminEnergy = lazy(() => import('../pages/admin/Energy.jsx'));
const AdminReports = lazy(() => import('../pages/admin/Reports.jsx'));
const AdminSettings = lazy(() => import('../pages/admin/Settings.jsx'));
const AdminProfile = lazy(() => import('../pages/admin/Profile.jsx'));

const FacultyDashboard = lazy(() => import('../pages/faculty/Dashboard.jsx'));
const FacultyBook = lazy(() => import('../pages/faculty/Book.jsx'));
const FacultyComputers = lazy(() => import('../pages/faculty/Computers.jsx'));
const FacultyBookings = lazy(() => import('../pages/faculty/Bookings.jsx'));
const FacultyProfile = lazy(() => import('../pages/faculty/Profile.jsx'));

const StudentDashboard = lazy(() => import('../pages/student/Dashboard.jsx'));
const StudentBook = lazy(() => import('../pages/student/Book.jsx'));
const StudentComputers = lazy(() => import('../pages/student/Computers.jsx'));
const StudentBookings = lazy(() => import('../pages/student/Bookings.jsx'));
const StudentProfile = lazy(() => import('../pages/student/Profile.jsx'));

function PageFallback() {
  return (
    <div style={{ padding: '3rem' }}>
      <Spinner />
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* The laboratory kiosk. Deliberately outside the session guards:
            it is a device with its own key, not a signed-in person. */}
        <Route path="/kiosk" element={<Kiosk />} />

        {/* Public — student and faculty */}
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Administrator portal. These are static paths, so they match
              ahead of the protected /admin/* section below. */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/register" element={<AdminRegister />} />
        </Route>

        {/* Admin — the guard denies faculty and student tokens, and the API
            re-checks the role on every request behind these pages. */}
        <Route element={<ProtectedRoute allow={['admin']} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="computers" element={<AdminComputers />} />
            <Route path="bookings" element={<AdminBookings />} />
            <Route path="monitoring" element={<AdminMonitoring />} />
            <Route path="energy" element={<AdminEnergy />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="profile" element={<AdminProfile />} />
          </Route>
        </Route>

        {/* Faculty */}
        <Route element={<ProtectedRoute allow={['faculty']} />}>
          <Route path="/faculty" element={<FacultyLayout />}>
            <Route index element={<Navigate to="/faculty/dashboard" replace />} />
            <Route path="dashboard" element={<FacultyDashboard />} />
            <Route path="book" element={<FacultyBook />} />
            <Route path="computers" element={<FacultyComputers />} />
            <Route path="bookings" element={<FacultyBookings />} />
            <Route path="profile" element={<FacultyProfile />} />
          </Route>
        </Route>

        {/* Student */}
        <Route element={<ProtectedRoute allow={['student']} />}>
          <Route path="/student" element={<StudentLayout />}>
            <Route index element={<Navigate to="/student/dashboard" replace />} />
            <Route path="dashboard" element={<StudentDashboard />} />
            <Route path="book" element={<StudentBook />} />
            <Route path="computers" element={<StudentComputers />} />
            <Route path="bookings" element={<StudentBookings />} />
            <Route path="profile" element={<StudentProfile />} />
          </Route>
        </Route>

        {/* Landing: send people wherever their role belongs. */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<RoleRedirect />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

/** Sends an authenticated user to their own dashboard. */
function RoleRedirect() {
  const { homePath } = useAuth();
  return <Navigate to={homePath} replace />;
}
