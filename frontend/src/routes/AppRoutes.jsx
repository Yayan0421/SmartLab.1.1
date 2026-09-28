import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute, { PublicOnlyRoute } from './ProtectedRoute.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import Spinner from '../components/Spinner.jsx';
import NotFound from '../pages/NotFound.jsx';

import Login from '../pages/auth/Login.jsx';
import AdminLogin from '../pages/auth/AdminLogin.jsx';
const Kiosk = lazy(() => import('../pages/kiosk/Kiosk.jsx'));

// The public front door. Lazy, because a signed-in person goes straight to
// their dashboard and should never download the marketing page to do it.
const Landing = lazy(() => import('../pages/Landing.jsx'));

import AdminLayout from '../layouts/AdminLayout.jsx';
import FacultyLayout from '../layouts/FacultyLayout.jsx';
import StudentLayout from '../layouts/StudentLayout.jsx';

// The admin screens carry the charting library and the heaviest tables, so
// they load on demand rather than in the bundle every student downloads.
const AdminDashboard = lazy(() => import('../pages/admin/Dashboard.jsx'));
const AdminUsers = lazy(() => import('../pages/admin/Users.jsx'));
const AdminReservations = lazy(() => import('../pages/admin/Reservations.jsx'));
const AdminMonitoring = lazy(() => import('../pages/admin/Monitoring.jsx'));
const AdminEnergy = lazy(() => import('../pages/admin/Energy.jsx'));
const AdminReports = lazy(() => import('../pages/admin/Reports.jsx'));
const AdminSettings = lazy(() => import('../pages/admin/Settings.jsx'));
const AdminProfile = lazy(() => import('../pages/admin/Profile.jsx'));

// Super-admin-only screens. Lazy like the rest, so an ordinary admin never
// downloads the pages their token would be refused on anyway.
const AdminAdministrators = lazy(() => import('../pages/admin/Administrators.jsx'));
const AdminAuditLogs = lazy(() => import('../pages/admin/AuditLogs.jsx'));

const FacultyDashboard = lazy(() => import('../pages/faculty/Dashboard.jsx'));
const FacultyReserve = lazy(() => import('../pages/faculty/Reserve.jsx'));
const FacultyReservations = lazy(() => import('../pages/faculty/Reservations.jsx'));
const FacultyProfile = lazy(() => import('../pages/faculty/Profile.jsx'));

const StudentDashboard = lazy(() => import('../pages/student/Dashboard.jsx'));
const StudentReserve = lazy(() => import('../pages/student/Reserve.jsx'));
const StudentReservations = lazy(() => import('../pages/student/Reservations.jsx'));
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

          {/* Administrator portal. A static path, so it matches ahead of
              the protected /admin/* section below. */}
          <Route path="/admin/login" element={<AdminLogin />} />
        </Route>

        {/* Admin — the guard denies faculty and student tokens, and the API
            re-checks the role on every request behind these pages. */}
        <Route element={<ProtectedRoute allow={['admin', 'super_admin']} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="reservations" element={<AdminReservations />} />
            <Route path="monitoring" element={<AdminMonitoring />} />
            <Route path="energy" element={<AdminEnergy />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="profile" element={<AdminProfile />} />

            {/* The system itself: only its owner. A plain admin who types
                one of these URLs is sent back to the dashboard, and the
                matching API routes refuse the token regardless. */}
            <Route element={<ProtectedRoute allow={['super_admin']} />}>
              <Route path="administrators" element={<AdminAdministrators />} />
              <Route path="audit-logs" element={<AdminAuditLogs />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>
          </Route>
        </Route>

        {/* Faculty */}
        <Route element={<ProtectedRoute allow={['faculty']} />}>
          <Route path="/faculty" element={<FacultyLayout />}>
            <Route index element={<Navigate to="/faculty/dashboard" replace />} />
            <Route path="dashboard" element={<FacultyDashboard />} />
            <Route path="reserve" element={<FacultyReserve />} />
            <Route path="reservations" element={<FacultyReservations />} />
            <Route path="profile" element={<FacultyProfile />} />
          </Route>
        </Route>

        {/* Student */}
        <Route element={<ProtectedRoute allow={['student']} />}>
          <Route path="/student" element={<StudentLayout />}>
            <Route index element={<Navigate to="/student/dashboard" replace />} />
            <Route path="dashboard" element={<StudentDashboard />} />
            <Route path="reserve" element={<StudentReserve />} />
            <Route path="reservations" element={<StudentReservations />} />
            <Route path="profile" element={<StudentProfile />} />
          </Route>
        </Route>

        {/*
          The front door.

          A visitor gets the landing page; somebody already signed in gets
          their own dashboard, because showing a logged-in user a "Get
          Started" button is asking them to start something they are in
          the middle of.
        */}
        <Route path="/" element={<Front />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

/**
 * The root path, which means two different things depending on who asks.
 *
 * While the session is still being restored it renders nothing rather
 * than the landing page: a signed-in user would otherwise see the
 * marketing page flash before being redirected away from it.
 */
function Front() {
  const { user, loading, homePath } = useAuth();

  if (loading) return <PageFallback />;
  if (user) return <Navigate to={homePath} replace />;
  return <Landing />;
}
