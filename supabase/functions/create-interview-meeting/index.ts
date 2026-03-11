import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Creates a Google Calendar event with Google Meet for an interview booking.
 *
 * Required Supabase Edge Function secrets:
 *   GOOGLE_SERVICE_ACCOUNT_JSON - The full JSON content of the service account key file
 *   GOOGLE_WORKSPACE_IMPERSONATE_USER - Optional Google Workspace user to impersonate (required for primary user calendar / Meet creation)
 *   GOOGLE_CALENDAR_ID          - Optional calendar ID to write events to (defaults to primary)
 *   SUPABASE_URL               - Auto-provided by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY   - Auto-provided by Supabase
 *
 * Request body:
 *   applicantName    - Full name of the applicant
 *   applicantEmail   - Applicant's email address
 *   positionTitle    - Position(s) being interviewed for
 *   date             - Interview date (YYYY-MM-DD)
 *   startTime        - Start time (HH:MM)
 *   endTime          - End time (HH:MM)
 *   interviewerName  - Optional interviewer name
 *   ccEmails         - Array of emails to CC on the invite
 *   durationMinutes  - Duration in minutes (fallback if endTime not provided)
 *   bookingId        - interview_bookings row ID to update with Meet link
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_WORKSPACE_IMPERSONATE_USER = Deno.env
    .get("GOOGLE_WORKSPACE_IMPERSONATE_USER")
    ?.trim();
const GOOGLE_CALENDAR_ID =
    Deno.env.get("GOOGLE_CALENDAR_ID")?.trim() || "primary";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL =
    Deno.env.get("FROM_EMAIL") || "WOSS Robotics <tech@wossrobotics.ca>";

/** Generate an ICS calendar invite string. */
function generateICS(params: {
    uid: string;
    summary: string;
    description: string;
    startDateTime: string; // YYYY-MM-DDTHH:MM:SS
    endDateTime: string;
    timeZone: string;
    organizer: string;
    attendees: string[];
}): string {
    const toICSDate = (dt: string, tz: string) => {
        // Format: 20260319T113000
        return dt.replace(/[-:]/g, "").replace("T", "T");
    };
    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//WOSS Robotics//Interview Scheduler//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        `UID:${params.uid}`,
        `DTSTAMP:${toICSDate(new Date().toISOString().replace(/\..*$/, ""), "UTC")}Z`,
        `DTSTART;TZID=${params.timeZone}:${toICSDate(params.startDateTime, params.timeZone)}`,
        `DTEND;TZID=${params.timeZone}:${toICSDate(params.endDateTime, params.timeZone)}`,
        `SUMMARY:${params.summary}`,
        `DESCRIPTION:${params.description.replace(/\n/g, "\\n")}`,
        `ORGANIZER:mailto:${params.organizer}`,
        ...params.attendees.map((a) => `ATTENDEE;RSVP=TRUE:mailto:${a}`),
        "END:VEVENT",
        "END:VCALENDAR",
    ];
    return lines.join("\r\n");
}

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

/** Build a JWT from the service account credentials and exchange it for an access token. */
async function getAccessToken(
    serviceAccount: {
        client_email: string;
        private_key: string;
        token_uri: string;
    },
    subject?: string,
): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload: Record<string, string | number> = {
        iss: serviceAccount.client_email,
        scope: "https://www.googleapis.com/auth/calendar",
        aud: serviceAccount.token_uri,
        iat: now,
        exp: now + 3600,
    };
    if (subject) payload.sub = subject;

    const encode = (obj: unknown) =>
        btoa(JSON.stringify(obj))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

    const unsignedToken = `${encode(header)}.${encode(payload)}`;

    // Import the private key and sign
    const pemContents = serviceAccount.private_key
        .replace(/-----BEGIN PRIVATE KEY-----/, "")
        .replace(/-----END PRIVATE KEY-----/, "")
        .replace(/\s/g, "");

    const binaryKey = Uint8Array.from(atob(pemContents), (c) =>
        c.charCodeAt(0),
    );

    const key = await crypto.subtle.importKey(
        "pkcs8",
        binaryKey,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
    );

    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(unsignedToken),
    );

    const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    const jwt = `${unsignedToken}.${sig}`;

    // Exchange JWT for access token
    const tokenRes = await fetch(serviceAccount.token_uri, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt,
        }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
        throw new Error(
            `Failed to get access token: ${JSON.stringify(tokenData)}`,
        );
    }

    return tokenData.access_token;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Verify authentication
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: "Missing authorization" }),
                {
                    status: 401,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        const token = authHeader.replace("Bearer ", "");
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const {
            applicantName,
            applicantEmail,
            positionTitle,
            date,
            startTime,
            endTime,
            interviewerName,
            ccEmails,
            durationMinutes,
            bookingId,
        } = await req.json();

        if (!applicantEmail || !date || !startTime) {
            return new Response(
                JSON.stringify({
                    error: "Missing required fields: applicantEmail, date, startTime",
                }),
                {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        // Load Google service account credentials
        const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
        if (!serviceAccountJson) {
            // Dev fallback: log and return a placeholder
            console.log(
                `[CALENDAR] Would create event: ${applicantName} on ${date} at ${startTime}`,
            );
            return new Response(
                JSON.stringify({
                    message:
                        "Calendar event logged (no GOOGLE_SERVICE_ACCOUNT_JSON configured)",
                    meetLink: null,
                    eventId: "dev-" + Date.now(),
                }),
                {
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        const serviceAccount = JSON.parse(serviceAccountJson);
        const accessToken = await getAccessToken(
            serviceAccount,
            GOOGLE_WORKSPACE_IMPERSONATE_USER,
        );

        // Build start/end datetimes (strip seconds if already present, e.g. "11:30:00" → "11:30")
        const normalizeTime = (t: string) =>
            t.length > 5 ? t.substring(0, 5) : t;
        const startDateTime = `${date}T${normalizeTime(startTime)}:00`;
        let endDateTime: string;
        if (endTime) {
            endDateTime = `${date}T${normalizeTime(endTime)}:00`;
        } else {
            const dur = durationMinutes || 20;
            const [h, m] = normalizeTime(startTime).split(":").map(Number);
            const totalMin = h * 60 + m + dur;
            const eh = String(Math.floor(totalMin / 60)).padStart(2, "0");
            const em = String(totalMin % 60).padStart(2, "0");
            endDateTime = `${date}T${eh}:${em}:00`;
        }

        const eventTitle = `WOSS Robotics Interview — ${applicantName || "Applicant"} — ${positionTitle || "Executive Position"}`;

        const eventDescription = `Interview for the ${positionTitle || "Executive"} position on the WOSS Robotics executive team.\n\nApplicant: ${applicantName || "N/A"}\nEmail: ${applicantEmail}${interviewerName ? `\nInterviewer: ${interviewerName}` : ""}`;

        // Note: attendees omitted — service accounts cannot invite attendees without Domain-Wide Delegation.
        // Calendar invites are sent as ICS attachments via Resend instead.
        const event = {
            summary: eventTitle,
            description: eventDescription,
            start: {
                dateTime: startDateTime,
                timeZone: "America/Toronto",
            },
            end: {
                dateTime: endDateTime,
                timeZone: "America/Toronto",
            },
            reminders: {
                useDefault: true,
            },
        };

        // Create the Calendar event
        const calRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/events?sendUpdates=all`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(event),
            },
        );

        const calData = await calRes.json();

        if (!calRes.ok) {
            console.error("Google Calendar API error:", calData);
            const googleMessage =
                calData?.error?.message || calData?.error_description;
            const googleReason = calData?.error?.errors?.[0]?.reason;

            let hint: string | undefined;

            if (googleReason === "notFound") {
                hint = `Calendar '${GOOGLE_CALENDAR_ID}' was not found for the current credential. If this is a shared calendar, share it with the service account email and grant permission to make changes to events.`;
            } else if (googleReason === "forbidden") {
                hint = `The authenticated Google identity does not have write access to calendar '${GOOGLE_CALENDAR_ID}'. Share the calendar with the service account email and grant permission to make changes to events.`;
            }

            return new Response(
                JSON.stringify({
                    error: "Failed to create calendar event",
                    details: calData,
                    hint,
                    calendarId: GOOGLE_CALENDAR_ID,
                    impersonatedUser: GOOGLE_WORKSPACE_IMPERSONATE_USER || null,
                    googleMessage,
                }),
                {
                    status: 500,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        const meetLink = calData.hangoutLink || null;
        const eventId = calData.id;
        const htmlLink = calData.htmlLink;

        // Store the event ID in the booking record
        if (bookingId) {
            await supabase
                .from("interview_bookings")
                .update({
                    meet_link: meetLink,
                    calendar_event_id: eventId,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", bookingId);
        }

        // Send ICS calendar invite via Resend to applicant + CC emails
        // (Service accounts can't add attendees directly — ICS attachment is the workaround)
        if (RESEND_API_KEY && applicantEmail) {
            const allRecipients = [
                applicantEmail,
                ...(Array.isArray(ccEmails)
                    ? ccEmails.filter((e: string) => e && e !== applicantEmail)
                    : []),
            ];
            const icsContent = generateICS({
                uid: `woss-interview-${eventId || Date.now()}@wossrobotics.ca`,
                summary: eventTitle,
                description: eventDescription,
                startDateTime,
                endDateTime,
                timeZone: "America/Toronto",
                organizer: "roboticswhiteoaks@gmail.com",
                attendees: allRecipients,
            });
            const icsBase64 = btoa(unescape(encodeURIComponent(icsContent)));

            await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${RESEND_API_KEY}`,
                },
                body: JSON.stringify({
                    from: FROM_EMAIL,
                    to: [applicantEmail],
                    cc: Array.isArray(ccEmails)
                        ? ccEmails.filter(
                              (e: string) => e && e !== applicantEmail,
                          )
                        : [],
                    subject: `Calendar Invite — ${eventTitle}`,
                    html: `<p>Hi ${applicantName || "there"},</p><p>Please find your interview calendar invite attached. Click the .ics file to add it to your calendar.</p><p><strong>${eventTitle}</strong><br>${startDateTime.replace("T", " ")} – ${endDateTime.split("T")[1]} (Toronto time)</p>`,
                    attachments: [
                        {
                            filename: "interview-invite.ics",
                            content: icsBase64,
                        },
                    ],
                }),
            }).catch((e: Error) =>
                console.error("Failed to send ICS email:", e.message),
            );
        }

        return new Response(
            JSON.stringify({
                meetLink,
                eventId,
                htmlLink,
                message: "Calendar event created successfully",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    } catch (err) {
        console.error("Error:", err);
        let hint: string | undefined;
        const message = (err as Error).message;

        if (message.includes("unauthorized_client")) {
            hint =
                "Google Workspace domain-wide delegation is not authorized for this service account. In Google Admin, add the numeric service account Client ID and grant https://www.googleapis.com/auth/calendar.";
        } else if (message.includes("invalid_grant")) {
            hint =
                "The impersonated Google Workspace user may be incorrect, inactive, or not authorized for domain-wide delegation.";
        }

        return new Response(
            JSON.stringify({
                error: message,
                hint,
                calendarId: GOOGLE_CALENDAR_ID,
                impersonatedUser: GOOGLE_WORKSPACE_IMPERSONATE_USER || null,
            }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }
});
