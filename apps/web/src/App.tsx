import { Navigate, Route, Routes } from 'react-router';
import OperationsPage from './views/OperationsPage.js';
import ProjectsCoIdPage from './views/ProjectsCoIdPage.js';
import OfficeShell from './office/OfficeShell.js';
import OverviewPage from './views/OverviewPage.js';
import AgentsPage from './views/AgentsPage.js';
import TaskBoardPage from './views/TaskBoardPage.js';
import CalendarPage from './views/CalendarPage.js';
import OpportunitiesPage from './views/OpportunitiesPage.js';
import PipelinePage from './views/PipelinePage.js';
import InboxPage from './views/InboxPage.js';
import WorkPage from './views/WorkPage.js';
import ProfilePage from './views/ProfilePage.js';
import PolicyPage from './views/PolicyPage.js';
import KnowledgePage from './views/KnowledgePage.js';
import ActivityPage from './views/ActivityPage.js';
import CapabilitiesPage from './views/CapabilitiesPage.js';
import NotFoundPage from './views/NotFoundPage.js';

export default function App() {
  return <Routes>
    <Route element={<OfficeShell />}>
      <Route index element={null} />
      <Route path="overview" element={<OverviewPage />} />
      <Route path="agents" element={<AgentsPage />} />
      <Route path="tasks" element={<TaskBoardPage />} />
      <Route path="calendar" element={<CalendarPage />} />
      <Route path="opportunities" element={<OpportunitiesPage />} />
      <Route path="pipeline" element={<PipelinePage />} />
      <Route path="inbox" element={<InboxPage />} />
      <Route path="work" element={<WorkPage />} />
      <Route path="profile" element={<ProfilePage />} />
      <Route path="policy" element={<PolicyPage />} />
      <Route path="knowledge" element={<KnowledgePage />} />
      <Route path="activity" element={<ActivityPage />} />
      <Route path="capabilities" element={<CapabilitiesPage />} />
      <Route path="operations" element={<OperationsPage />} />
      <Route path="projects-co-id" element={<ProjectsCoIdPage />} />
      <Route path="office" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Routes>;
}
