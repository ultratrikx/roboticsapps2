/**
 * Beautiful HTML email template builder matching the WOSS Robotics portal aesthetic.
 * Used for decision notifications, meeting updates, and other transactional emails.
 */

const COLORS = {
    black: "#000000",
    darkBg: "#030213",
    gray: "#6c6c6c",
    border: "#dbe0ec",
    lightBg: "#f9f9f7",
    white: "#ffffff",
    red: "#d4183d",
};

function emailWrapper(content: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f0f4fa;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#a8d3ff 0%,#e8f3ff 40%,#fff4df 100%);min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 24px;">
        <!-- Logo -->
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr>
            <td style="padding-right:10px;">
              <div style="width:8px;height:8px;background-color:${COLORS.black};"></div>
            </td>
            <td>
              <span style="font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${COLORS.black};letter-spacing:-0.3px;">WOSS Robotics</span>
            </td>
          </tr>
        </table>

        <!-- Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background-color:${COLORS.white};border:2px solid ${COLORS.black};">
          <tr>
            <td style="padding:44px 40px 40px;">
              ${content}
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
          <tr>
            <td align="center">
              <p style="font-family:'Courier New',monospace;font-size:10px;color:${COLORS.gray};margin:0;">
                WOSS Robotics &middot; 2026-2027 Executive Applications
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function label(text: string): string {
    return `<p style="font-family:'Courier New',monospace;font-size:11px;color:${COLORS.gray};text-transform:uppercase;letter-spacing:2px;margin:0 0 12px;">${text}</p>`;
}

function heading(text: string): string {
    return `<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:28px;color:${COLORS.black};letter-spacing:-0.8px;line-height:1.15;margin:0 0 8px;">${text}</h1>`;
}

function paragraph(text: string): string {
    return `<p style="font-family:Georgia,'Times New Roman',serif;font-size:16px;color:${COLORS.black};letter-spacing:-0.2px;line-height:1.6;margin:0 0 16px;">${text}</p>`;
}

function subtext(text: string): string {
    return `<p style="font-family:Georgia,'Times New Roman',serif;font-size:14px;color:${COLORS.gray};line-height:1.5;margin:0 0 16px;">${text}</p>`;
}

function divider(): string {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="border-top:1px solid ${COLORS.border};"></td></tr></table>`;
}

function button(
    text: string,
    href: string,
    variant: "primary" | "outline" = "primary",
): string {
    const styles =
        variant === "primary"
            ? `background-color:${COLORS.black};color:${COLORS.white};`
            : `background-color:${COLORS.white};color:${COLORS.black};border:1px solid ${COLORS.border};`;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td align="center">
        <a href="${href}" style="display:inline-block;${styles}font-family:'Courier New',monospace;font-size:13px;text-decoration:none;padding:16px 32px;letter-spacing:0.5px;">&#9642;&nbsp;&nbsp;${text}</a>
      </td>
    </tr>
  </table>`;
}

function infoBox(items: { label: string; value: string }[]): string {
    const rows = items
        .map(
            (item) => `<tr>
      <td style="padding:12px 20px;border-bottom:1px solid ${COLORS.border};">
        <p style="font-family:'Courier New',monospace;font-size:10px;color:${COLORS.gray};text-transform:uppercase;letter-spacing:1.5px;margin:0 0 4px;">${item.label}</p>
        <p style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:${COLORS.black};margin:0;">${item.value}</p>
      </td>
    </tr>`,
        )
        .join("");

    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.lightBg};border:1px solid ${COLORS.border};margin:24px 0;">
    ${rows}
  </table>`;
}

// ─── Email Templates ─────────────────────────────────────────────

export function acceptanceEmail(
    firstName: string,
    positionTitle: string,
    portalUrl: string,
): string {
    return emailWrapper(`
    ${label("Accepted")}
    ${heading("Welcome to WOSS Robotics!")}
    <p style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:${COLORS.gray};letter-spacing:-0.2px;line-height:1.5;margin:0 0 32px;">
      Congratulations on your new role.
    </p>

    ${paragraph(`Dear ${firstName},`)}
    ${paragraph(`Congratulations! We are thrilled to offer you the position of <strong>${positionTitle}</strong> on the WOSS Robotics executive team for the 2026-2027 year.`)}
    ${paragraph("Your application and interview stood out among a highly competitive pool of candidates. We were impressed by your experiences, your dedication, and your passion for robotics.")}
    ${paragraph("Please confirm your acceptance through the portal at your earliest convenience. We look forward to an incredible year working together!")}

    ${infoBox([
        { label: "Position", value: positionTitle },
        { label: "Team", value: "WOSS Robotics Executive — 2026-2027" },
        { label: "Status", value: "Accepted" },
    ])}

    ${button("Open Portal", portalUrl)}

    ${divider()}

    <p style="font-family:Georgia,'Times New Roman',serif;font-size:16px;color:${COLORS.black};line-height:1.6;margin:0;">
      Warmly,<br />The WOSS Robotics Executive Team
    </p>
  `);
}

export function rejectionEmail(
    firstName: string,
    positionTitle: string,
    portalUrl: string,
): string {
    return emailWrapper(`
    ${label("Update")}
    ${heading("Update from WOSS Robotics")}
    <p style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:${COLORS.gray};letter-spacing:-0.2px;line-height:1.5;margin:0 0 32px;">
      Regarding your application for ${positionTitle}.
    </p>

    ${paragraph(`Dear ${firstName},`)}
    ${paragraph(`Thank you for applying for the <strong>${positionTitle}</strong> position on the WOSS Robotics executive team.`)}
    ${paragraph("This year we received many strong applications from talented candidates. Due to the limited number of executive positions available, we are unable to offer you a role at this time.")}
    ${paragraph("We truly value your interest and encourage you to stay involved with the club as a general member. We hope you'll consider applying again next year — your effort and enthusiasm are deeply appreciated.")}

    ${infoBox([
        { label: "Position", value: positionTitle },
        { label: "Status", value: "Not selected" },
    ])}

    ${button("View Details", portalUrl, "outline")}

    ${divider()}

    <p style="font-family:Georgia,'Times New Roman',serif;font-size:16px;color:${COLORS.black};line-height:1.6;margin:0;">
      Best wishes,<br />The WOSS Robotics Executive Team
    </p>
  `);
}

export function meetingUpdateEmail(
    firstName: string,
    meetingTitle: string,
    date: string,
    time: string,
    location: string,
    details: string,
    portalUrl: string,
): string {
    return emailWrapper(`
    ${label("Meeting Update")}
    ${heading(meetingTitle)}
    <p style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:${COLORS.gray};letter-spacing:-0.2px;line-height:1.5;margin:0 0 32px;">
      You have an upcoming meeting scheduled.
    </p>

    ${paragraph(`Hi ${firstName},`)}
    ${paragraph(details)}

    ${infoBox([
        { label: "Event", value: meetingTitle },
        { label: "Date", value: date },
        { label: "Time", value: time },
        { label: "Location", value: location },
    ])}

    ${button("Open Portal", portalUrl)}

    ${divider()}

    <p style="font-family:Georgia,'Times New Roman',serif;font-size:14px;color:${COLORS.gray};line-height:1.5;margin:0;">
      If you have any questions or need to reschedule, please reach out through the portal.
    </p>
  `);
}

export function genericNotificationEmail(
    firstName: string,
    subject: string,
    bodyText: string,
    portalUrl: string,
): string {
    return emailWrapper(`
    ${label("Notification")}
    ${heading(subject)}
    <p style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:${COLORS.gray};letter-spacing:-0.2px;line-height:1.5;margin:0 0 32px;">
      A new update from WOSS Robotics.
    </p>

    ${paragraph(`Hi ${firstName},`)}
    ${bodyText
        .split("\n")
        .map((line) => paragraph(line))
        .join("")}

    ${button("Open Portal", portalUrl)}

    ${divider()}

    <p style="font-family:Georgia,'Times New Roman',serif;font-size:14px;color:${COLORS.gray};line-height:1.5;margin:0;">
      The WOSS Robotics Executive Team
    </p>
  `);
}

export function decisionReleasedEmail(
    firstName: string,
    portalUrl: string,
): string {
    return emailWrapper(`
    ${label("Decisions Released")}
    ${heading("Your decision is ready")}
    <p style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:${COLORS.gray};letter-spacing:-0.2px;line-height:1.5;margin:0 0 32px;">
      The executive application decisions have been released.
    </p>

    ${paragraph(`Dear ${firstName},`)}
    ${paragraph("The WOSS Robotics executive team has finished reviewing all applications for the 2026-2027 year. Your decision letter is now available in the portal.")}
    ${paragraph("Please sign in to view your personalized decision letter and any next steps.")}

    ${button("View Your Decision", portalUrl)}

    ${divider()}

    <p style="font-family:Georgia,'Times New Roman',serif;font-size:14px;color:${COLORS.gray};line-height:1.5;margin:0;">
      Thank you for your interest in WOSS Robotics.<br />
      The WOSS Robotics Executive Team
    </p>
  `);
}
