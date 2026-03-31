import { createBrowserRouter } from "react-router";

import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { AuthConfirm } from "./pages/AuthConfirm";
import { Onboarding } from "./pages/Onboarding";
import { ApplicantLayout } from "./layouts/ApplicantLayout";
import { AdminLayout } from "./layouts/AdminLayout";
import { ProtectedRoute } from "./lib/ProtectedRoute";

// Applicant pages
import { ApplicantDashboard } from "./pages/applicant/Dashboard";
import { ApplicantPrograms } from "./pages/applicant/Programs";
import { ApplicantProfile } from "./pages/applicant/Profile";
import { ApplicantActivities } from "./pages/applicant/Activities";
import { ApplicantEssays } from "./pages/applicant/Essays";
import { ApplicantHonors } from "./pages/applicant/Honors";
import { ApplicantReview } from "./pages/applicant/Review";
import { ApplicantInterview } from "./pages/applicant/Interview";
import { ApplicantDecisions } from "./pages/applicant/Decisions";

// Admin pages
import { AdminDashboard } from "./pages/admin/Dashboard";
import { AdminApplicationReview } from "./pages/admin/ApplicationReview";
import { AdminSettings } from "./pages/admin/Settings";
import { AdminCommunications } from "./pages/admin/Communications";
import { AdminInterviews } from "./pages/admin/Interviews";
import { AdminQuestions } from "./pages/admin/Questions";
import { AdminResponses } from "./pages/admin/Responses";
import { AdminAIAnalysis } from "./pages/admin/AIAnalysis";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Home,
  },
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/auth/confirm",
    Component: AuthConfirm,
  },
  {
    path: "/onboarding",
    element: (
      <ProtectedRoute requiredRole="applicant">
        <Onboarding />
      </ProtectedRoute>
    ),
  },
  {
    path: "/applicant",
    element: (
      <ProtectedRoute requiredRole="applicant">
        <ApplicantLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, Component: ApplicantDashboard },
      { path: "positions", Component: ApplicantPrograms },
      { path: "profile", Component: ApplicantProfile },
      { path: "activities", Component: ApplicantActivities },
      { path: "responses", Component: ApplicantEssays },
      { path: "honors", Component: ApplicantHonors },
      { path: "review", Component: ApplicantReview },
      { path: "interview", Component: ApplicantInterview },
      { path: "decisions", Component: ApplicantDecisions },
    ],
  },
  {
    path: "/admin",
    element: (
      <ProtectedRoute requiredRole="admin">
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, Component: AdminDashboard },
      { path: "applications/:id", Component: AdminApplicationReview },
      { path: "settings", Component: AdminSettings },
      { path: "communications", Component: AdminCommunications },
      { path: "interviews", Component: AdminInterviews },
      { path: "questions", Component: AdminQuestions },
      { path: "responses", Component: AdminResponses },
      { path: "ai-analysis", Component: AdminAIAnalysis },
    ],
  },
]);
