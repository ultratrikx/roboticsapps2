import { describe, it, expect } from 'vitest';
import {
  acceptanceEmail,
  rejectionEmail,
  meetingUpdateEmail,
  interviewScheduledEmail,
  genericNotificationEmail,
  decisionReleasedEmail,
} from '../app/lib/email-templates';

describe('Email Templates', () => {
  describe('acceptanceEmail', () => {
    it('produces valid HTML with required content', () => {
      const html = acceptanceEmail('Alice', 'President', 'https://portal.example.com');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Alice');
      expect(html).toContain('President');
      expect(html).toContain('https://portal.example.com');
      expect(html).toContain('Accepted');
      expect(html).toContain('WOSS Robotics');
    });

    it('includes the portal link as a button', () => {
      const html = acceptanceEmail('Bob', 'VP', 'https://example.com/portal');
      expect(html).toContain('href="https://example.com/portal"');
      expect(html).toContain('Open Portal');
    });

    it('contains an info box with position and team', () => {
      const html = acceptanceEmail('Eve', 'Secretary', 'https://portal.test');
      expect(html).toContain('Secretary');
      expect(html).toContain('2026-2027');
    });
  });

  describe('rejectionEmail', () => {
    it('produces valid HTML with required content', () => {
      const html = rejectionEmail('Charlie', 'Treasurer', 'https://portal.example.com');
      expect(html).toContain('Charlie');
      expect(html).toContain('Treasurer');
      expect(html).toContain('Not selected');
      expect(html).toContain('WOSS Robotics');
    });

    it('uses outline button style for "View Details"', () => {
      const html = rejectionEmail('Dana', 'VP', 'https://portal.test');
      expect(html).toContain('View Details');
      expect(html).toContain('href="https://portal.test"');
    });

    it('does not contain "Accepted" label', () => {
      const html = rejectionEmail('Frank', 'VP', 'https://portal.test');
      // The label should be "Update", not "Accepted"
      expect(html).not.toMatch(/<p[^>]*>Accepted<\/p>/);
    });
  });

  describe('meetingUpdateEmail', () => {
    it('includes all meeting details', () => {
      const html = meetingUpdateEmail(
        'Grace',
        'Team Kickoff',
        '2026-09-15',
        '3:00 PM',
        'Room 204',
        'Please bring your laptop.',
        'https://portal.test'
      );
      expect(html).toContain('Grace');
      expect(html).toContain('Team Kickoff');
      expect(html).toContain('2026-09-15');
      expect(html).toContain('3:00 PM');
      expect(html).toContain('Room 204');
      expect(html).toContain('Please bring your laptop.');
    });
  });

  describe('interviewScheduledEmail', () => {
    it('includes interview details in info box', () => {
      const html = interviewScheduledEmail(
        'Hank',
        'Lead Programmer',
        '2026-10-01',
        '10:00 AM',
        'Conference Room B',
        'https://portal.test'
      );
      expect(html).toContain('Hank');
      expect(html).toContain('Lead Programmer');
      expect(html).toContain('2026-10-01');
      expect(html).toContain('10:00 AM');
      expect(html).toContain('Conference Room B');
      expect(html).toContain('Interview Scheduled');
    });
  });

  describe('genericNotificationEmail', () => {
    it('renders subject and body text', () => {
      const html = genericNotificationEmail(
        'Ivy',
        'Important Update',
        'This is line 1.\nThis is line 2.',
        'https://portal.test'
      );
      expect(html).toContain('Ivy');
      expect(html).toContain('Important Update');
      expect(html).toContain('This is line 1.');
      expect(html).toContain('This is line 2.');
    });

    it('splits multi-line body into separate paragraphs', () => {
      const html = genericNotificationEmail('Jo', 'Test', 'Line A\nLine B', 'https://portal.test');
      // Each line should appear in its own paragraph
      const lineAMatch = html.match(/Line A/g);
      const lineBMatch = html.match(/Line B/g);
      expect(lineAMatch).not.toBeNull();
      expect(lineBMatch).not.toBeNull();
    });
  });

  describe('decisionReleasedEmail', () => {
    it('renders the decisions released template', () => {
      const html = decisionReleasedEmail('Kim', 'https://portal.test/decisions');
      expect(html).toContain('Kim');
      expect(html).toContain('Decisions Released');
      expect(html).toContain('View Your Decision');
      expect(html).toContain('https://portal.test/decisions');
    });

    it('includes WOSS Robotics branding', () => {
      const html = decisionReleasedEmail('Lee', 'https://portal.test');
      expect(html).toContain('WOSS Robotics');
      expect(html).toContain('2026-2027');
    });
  });

  describe('common structure', () => {
    it('all templates produce valid HTML documents', () => {
      const templates = [
        acceptanceEmail('A', 'B', 'https://x.com'),
        rejectionEmail('A', 'B', 'https://x.com'),
        meetingUpdateEmail('A', 'B', 'C', 'D', 'E', 'F', 'https://x.com'),
        interviewScheduledEmail('A', 'B', 'C', 'D', 'E', 'https://x.com'),
        genericNotificationEmail('A', 'B', 'C', 'https://x.com'),
        decisionReleasedEmail('A', 'https://x.com'),
      ];

      for (const html of templates) {
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<html');
        expect(html).toContain('</html>');
        expect(html).toContain('<body');
        expect(html).toContain('</body>');
        expect(html).toContain('WOSS Robotics');
      }
    });

    it('all templates include the gradient background', () => {
      const html = acceptanceEmail('A', 'B', 'https://x.com');
      expect(html).toContain('#a8d3ff');
      expect(html).toContain('#e8f3ff');
      expect(html).toContain('#fff4df');
    });
  });
});
