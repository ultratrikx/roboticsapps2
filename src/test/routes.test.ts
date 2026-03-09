import { describe, it, expect, vi } from 'vitest';

// Mock all page/layout components to avoid importing real modules with side effects
vi.mock('../app/pages/Home', () => ({ Home: () => null }));
vi.mock('../app/pages/Login', () => ({ Login: () => null }));
vi.mock('../app/pages/AuthConfirm', () => ({ AuthConfirm: () => null }));
vi.mock('../app/layouts/ApplicantLayout', () => ({ ApplicantLayout: () => null }));
vi.mock('../app/layouts/AdminLayout', () => ({ AdminLayout: () => null }));
vi.mock('../app/lib/ProtectedRoute', () => ({ ProtectedRoute: ({ children }: any) => children }));
vi.mock('../app/pages/applicant/Dashboard', () => ({ ApplicantDashboard: () => null }));
vi.mock('../app/pages/applicant/Programs', () => ({ ApplicantPrograms: () => null }));
vi.mock('../app/pages/applicant/Profile', () => ({ ApplicantProfile: () => null }));
vi.mock('../app/pages/applicant/Activities', () => ({ ApplicantActivities: () => null }));
vi.mock('../app/pages/applicant/Essays', () => ({ ApplicantEssays: () => null }));
vi.mock('../app/pages/applicant/Honors', () => ({ ApplicantHonors: () => null }));
vi.mock('../app/pages/applicant/Review', () => ({ ApplicantReview: () => null }));
vi.mock('../app/pages/applicant/Interview', () => ({ ApplicantInterview: () => null }));
vi.mock('../app/pages/applicant/Decisions', () => ({ ApplicantDecisions: () => null }));
vi.mock('../app/pages/admin/Dashboard', () => ({ AdminDashboard: () => null }));
vi.mock('../app/pages/admin/ApplicationReview', () => ({ AdminApplicationReview: () => null }));
vi.mock('../app/pages/admin/Settings', () => ({ AdminSettings: () => null }));
vi.mock('../app/pages/admin/Communications', () => ({ AdminCommunications: () => null }));
vi.mock('../app/pages/admin/Interviews', () => ({ AdminInterviews: () => null }));
vi.mock('../app/pages/admin/Questions', () => ({ AdminQuestions: () => null }));

const { router } = await import('../app/routes');

describe('Router configuration', () => {
  const routes = router.routes;

  it('defines top-level routes', () => {
    const paths = routes.map((r: any) => r.path);
    expect(paths).toContain('/');
    expect(paths).toContain('/login');
    expect(paths).toContain('/auth/confirm');
    expect(paths).toContain('/applicant');
    expect(paths).toContain('/admin');
  });

  it('has /auth/confirm route for magic link callback', () => {
    const authConfirm = routes.find((r: any) => r.path === '/auth/confirm');
    expect(authConfirm).toBeDefined();
  });

  describe('applicant routes', () => {
    const applicantRoute = routes.find((r: any) => r.path === '/applicant');
    const childPaths = applicantRoute?.children?.map((c: any) => c.path || '(index)') || [];

    it('has index route', () => {
      const hasIndex = applicantRoute?.children?.some((c: any) => c.index === true);
      expect(hasIndex).toBe(true);
    });

    it('includes all expected child routes', () => {
      expect(childPaths).toContain('positions');
      expect(childPaths).toContain('profile');
      expect(childPaths).toContain('activities');
      expect(childPaths).toContain('responses');
      expect(childPaths).toContain('honors');
      expect(childPaths).toContain('review');
      expect(childPaths).toContain('interview');
      expect(childPaths).toContain('decisions');
    });
  });

  describe('admin routes', () => {
    const adminRoute = routes.find((r: any) => r.path === '/admin');
    const childPaths = adminRoute?.children?.map((c: any) => c.path || '(index)') || [];

    it('has index route', () => {
      const hasIndex = adminRoute?.children?.some((c: any) => c.index === true);
      expect(hasIndex).toBe(true);
    });

    it('includes all expected child routes', () => {
      expect(childPaths).toContain('settings');
      expect(childPaths).toContain('communications');
      expect(childPaths).toContain('interviews');
      expect(childPaths).toContain('questions');
    });

    it('has parameterized application review route', () => {
      expect(childPaths).toContain('applications/:id');
    });
  });
});
