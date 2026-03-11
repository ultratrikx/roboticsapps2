import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAllApplications, useSettings } from "../../lib/hooks";
import { supabase } from "../../lib/supabase";
import {
    acceptanceEmail,
    rejectionEmail,
    decisionReleasedEmail,
    genericNotificationEmail,
} from "../../lib/email-templates";
import { CAL_BOOKING_URL } from "../../lib/interview-config";
import { formatList } from "../../lib/utils";

export function AdminCommunications() {
    const { applications, loading } = useAllApplications();
    const { settings, loading: settingsLoading, updateSetting } = useSettings();
    const [sending, setSending] = useState(false);
    const [sentCount, setSentCount] = useState(0);
    const [sentInterviewCount, setSentInterviewCount] = useState(0);
    const [existingDecisionIds, setExistingDecisionIds] = useState<Set<string>>(
        new Set(),
    );
    // email_log dedup: user_ids already sent interview/release emails
    const [emailLogInterviewIds, setEmailLogInterviewIds] = useState<
        Set<string>
    >(new Set());
    const [emailLogReleaseIds, setEmailLogReleaseIds] = useState<Set<string>>(
        new Set(),
    );
    const [error, setError] = useState<string | null>(null);
    const [emailErrors, setEmailErrors] = useState<string[]>([]);
    const [confirmAction, setConfirmAction] = useState<
        "accepted" | "rejected" | "interview" | "release" | null
    >(null);

    const decisionsReleased =
        settings.decisions_released === true ||
        settings.decisions_released === "true";

    // Flatten all application_positions, carrying profile + app-level status
    const allPositionEntries = applications.flatMap((app: any) =>
        (app.application_positions || []).map((ap: any) => ({
            ...ap,
            profiles: app.profiles,
            applicationStatus: app.status,
            userId: app.user_id,
            appId: app.id,
        })),
    );

    // Accepted: position-level accepted, OR app accepted with position still pending (fallback)
    const acceptedPositions = allPositionEntries.filter(
        (ap: any) =>
            ap.status === "accepted" ||
            (ap.applicationStatus === "accepted" && ap.status === "pending"),
    );
    // Rejected: position-level rejected, OR app rejected with position still pending (fallback)
    const rejectedPositions = allPositionEntries.filter(
        (ap: any) =>
            ap.status === "rejected" ||
            (ap.applicationStatus === "rejected" && ap.status === "pending"),
    );

    // All non-draft applications (for release notification)
    const nonDraftApplications = applications.filter(
        (app: any) => app.status !== "draft",
    );
    // Applications with interview_scheduled status
    const allInterviewApps = applications.filter(
        (app: any) => app.status === "interview_scheduled",
    );
    // Filter out those already sent an interview email
    const interviewCandidates = allInterviewApps.filter(
        (app: any) => !emailLogInterviewIds.has(app.user_id),
    );
    // Filter out those already sent a release notification
    const releaseNotifyApplicants = nonDraftApplications.filter(
        (app: any) => !emailLogReleaseIds.has(app.user_id),
    );

    // Load existing decisions to compute pending counts
    useEffect(() => {
        if (loading) return;
        supabase
            .from("decisions")
            .select("application_position_id")
            .then(({ data, error: err }) => {
                if (err) {
                    console.error("Failed to fetch existing decisions:", err);
                    setError(
                        `Failed to load existing decisions: ${err.message}`,
                    );
                    return;
                }
                setExistingDecisionIds(
                    new Set(
                        (data || []).map((d: any) => d.application_position_id),
                    ),
                );
            });
    }, [loading, sentCount]);

    // Load email_log to know who already received interview / release emails
    useEffect(() => {
        if (loading) return;
        supabase
            .from("email_log")
            .select("user_id, type")
            .then(({ data, error: err }) => {
                if (err) {
                    // email_log table may not exist yet — migration pending
                    console.warn("email_log not available:", err.message);
                    return;
                }
                const interviewSet = new Set<string>();
                const releaseSet = new Set<string>();
                for (const row of data || []) {
                    if (row.type === "interview") interviewSet.add(row.user_id);
                    if (row.type === "decisions_released")
                        releaseSet.add(row.user_id);
                }
                setEmailLogInterviewIds(interviewSet);
                setEmailLogReleaseIds(releaseSet);
            });
    }, [loading, sentInterviewCount, sentCount]);

    const pendingAccepted = acceptedPositions.filter(
        (ap: any) => !existingDecisionIds.has(ap.id),
    );
    const pendingRejected = rejectedPositions.filter(
        (ap: any) => !existingDecisionIds.has(ap.id),
    );
    const alreadySentAccepted =
        acceptedPositions.length - pendingAccepted.length;
    const alreadySentRejected =
        rejectedPositions.length - pendingRejected.length;

    const sendEmailNotification = async (
        ap: any,
        type: "accepted" | "rejected",
    ): Promise<boolean> => {
        try {
            const firstName = ap.profiles?.first_name || "Applicant";
            const positionTitle = ap.positions?.title || "the position";
            const email = ap.profiles?.email;
            if (!email) return false;

            const portalUrl = window.location.origin + "/applicant/decisions";
            const html =
                type === "accepted"
                    ? acceptanceEmail(firstName, positionTitle, portalUrl)
                    : rejectionEmail(firstName, positionTitle, portalUrl);

            const subject =
                type === "accepted"
                    ? `Congratulations! Welcome to WOSS Robotics — ${positionTitle}`
                    : `Update on your WOSS Robotics application — ${positionTitle}`;

            const { data, error: invokeErr } = await supabase.functions.invoke(
                "send-email",
                {
                    body: { to: email, subject, html },
                },
            );

            if (invokeErr) {
                console.error("Email invoke error:", invokeErr);
                return false;
            }

            // Check if the response indicates an error
            if (data?.error) {
                console.error("Email send error:", data.error);
                return false;
            }

            return true;
        } catch (err) {
            console.error("Failed to send email notification:", err);
            return false;
        }
    };

    const handleSendDecisions = async (
        type: "accepted" | "rejected",
        positions: any[],
    ) => {
        setConfirmAction(null);
        setSending(true);
        setError(null);
        setEmailErrors([]);
        let count = 0;
        let emailFailures: string[] = [];
        const pending = positions.filter(
            (ap: any) => !existingDecisionIds.has(ap.id),
        );

        for (const ap of pending) {
            const { error: err } = await supabase.from("decisions").insert({
                application_position_id: ap.id,
                type,
            });
            if (err) {
                console.error(
                    "Failed to insert decision for application_position:",
                    ap.id,
                    err,
                );
                setError(`Failed to send decision: ${err.message}`);
            } else {
                count++;
                const emailSent = await sendEmailNotification(ap, type);
                if (!emailSent) {
                    const name =
                        `${ap.profiles?.first_name || ""} ${ap.profiles?.last_name || ""}`.trim() ||
                        ap.profiles?.email;
                    emailFailures.push(name);
                }
            }
        }

        setSentCount((prev) => prev + count);
        setSending(false);

        if (count > 0) {
            toast.success(
                `${count} decision letter${count !== 1 ? "s" : ""} created`,
            );
        }
        if (emailFailures.length > 0) {
            setEmailErrors(emailFailures);
            toast.error(
                `Failed to email ${emailFailures.length} applicant${emailFailures.length !== 1 ? "s" : ""}. Decision letters were still created in the portal.`,
            );
        }
    };

    const handleSendInterviewInvitations = async () => {
        setConfirmAction(null);
        setSending(true);
        setError(null);
        setEmailErrors([]);
        let count = 0;
        let emailFailures: string[] = [];

        for (const app of interviewCandidates) {
            const profile = app.profiles;
            const email = profile?.email;
            if (!email) {
                emailFailures.push(profile?.first_name || "Unknown");
                continue;
            }
            const firstName = profile.first_name || "Applicant";
            const positionNames =
                formatList(
                    (app.application_positions || [])
                        .map((ap: any) => ap.positions?.title)
                        .filter(Boolean),
                ) || "Executive Position";
            const portalUrl = window.location.origin + "/applicant";
            const html = genericNotificationEmail(
                firstName,
                "You've Been Invited to Interview!",
                `Congratulations! You have been selected for an interview for ${positionNames}.\n\nPlease use the link below to book your interview slot at a time that works for you. You can also find this link on your applicant portal.\n\n${CAL_BOOKING_URL}\n\nWe look forward to meeting you!`,
                portalUrl + "/interview",
            );
            const { data, error: invokeErr } = await supabase.functions.invoke(
                "send-email",
                {
                    body: {
                        to: email,
                        subject: `Interview Invitation — WOSS Robotics Executive Positions`,
                        html,
                    },
                },
            );
            if (invokeErr || data?.error) {
                const name =
                    `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
                    email;
                emailFailures.push(name);
            } else {
                count++;
                // Log to email_log to prevent duplicate sends
                await supabase
                    .from("email_log")
                    .insert({
                        user_id: app.user_id,
                        type: "interview",
                        context_key: app.id,
                    })
                    .catch(() => {}); // ignore duplicate key errors
            }
        }

        setSentInterviewCount((prev) => prev + count);
        setSending(false);
        if (count > 0)
            toast.success(
                `Interview invitation sent to ${count} candidate${count !== 1 ? "s" : ""}`,
            );
        if (emailFailures.length > 0) {
            setEmailErrors(emailFailures);
            toast.error(
                `Failed to email ${emailFailures.length} candidate${emailFailures.length !== 1 ? "s" : ""}`,
            );
        }
    };

    const handleToggleRelease = async () => {
        setConfirmAction(null);
        const newValue = !decisionsReleased;
        await updateSetting("decisions_released", newValue);

        if (!newValue) {
            toast.success("Decisions hidden from applicants");
            return;
        }

        toast.success("Decisions are now visible to applicants");

        // Notify ALL non-draft applicants who haven't been notified yet
        try {
            const portalUrl = window.location.origin + "/applicant/decisions";
            let emailsSent = 0;
            for (const app of releaseNotifyApplicants) {
                const profile = app.profiles;
                if (!profile?.email) continue;
                const html = decisionReleasedEmail(
                    profile.first_name || "Applicant",
                    portalUrl,
                );
                const { data, error: invokeErr } =
                    await supabase.functions.invoke("send-email", {
                        body: {
                            to: profile.email,
                            subject:
                                "Your WOSS Robotics decision is ready to view",
                            html,
                        },
                    });
                if (!invokeErr && !data?.error) {
                    emailsSent++;
                    await supabase
                        .from("email_log")
                        .insert({
                            user_id: app.user_id,
                            type: "decisions_released",
                            context_key: "",
                        })
                        .catch(() => {});
                }
            }
            if (emailsSent > 0) {
                toast.success(
                    `Portal-open notification sent to ${emailsSent} applicant${emailsSent !== 1 ? "s" : ""}`,
                );
            }
        } catch (err) {
            console.error("Failed to send release notifications:", err);
            toast.error(
                "Decisions released, but some notification emails failed",
            );
        }

        // Trigger email_log refresh so counts update
        setSentCount((prev) => prev + 1);
    };

    if (loading || settingsLoading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="w-6 h-6 animate-spin text-[#6c6c6c]" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="border-b border-[#dbe0ec] pb-7">
                <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.1em] mb-3">
                    Admin — 03
                </p>
                <h1
                    className="font-['Source_Serif_4',serif] text-[40px] text-black tracking-[-1.2px]"
                    style={{ lineHeight: 1.05 }}
                >
                    Decision &<br />
                    Communications
                </h1>
                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-lg tracking-[-0.3px] mt-2">
                    Send decision letters and status updates to applicants.
                </p>
            </header>

            {error && (
                <div className="border border-red-300 bg-red-50 px-5 py-4 flex items-start justify-between gap-4">
                    <p className="font-['Radio_Canada_Big',sans-serif] text-sm text-red-700">
                        {error}
                    </p>
                    <button
                        onClick={() => setError(null)}
                        className="font-['Geist_Mono',monospace] text-[11px] text-red-500 hover:text-red-700 shrink-0"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {emailErrors.length > 0 && (
                <div className="border border-yellow-300 bg-yellow-50 px-5 py-4">
                    <p className="font-['Radio_Canada_Big',sans-serif] text-sm text-yellow-800 mb-2">
                        Email delivery failed for the following recipients:
                    </p>
                    <ul className="list-disc list-inside font-['Source_Serif_4',serif] text-yellow-700 text-sm">
                        {emailErrors.map((name, i) => (
                            <li key={i}>{name}</li>
                        ))}
                    </ul>
                    <p className="font-['Source_Serif_4',serif] text-yellow-700 text-xs mt-2">
                        Ensure the RESEND_API_KEY is configured in Supabase Edge
                        Function secrets.
                    </p>
                    <button
                        onClick={() => setEmailErrors([])}
                        className="font-['Geist_Mono',monospace] text-[11px] text-yellow-600 hover:text-yellow-800 mt-2"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Release Toggle */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                        Release Decisions
                    </h2>
                    <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                        001
                    </span>
                </div>
                <div className="border border-[#dbe0ec]">
                    <div className="flex items-center justify-between px-6 py-5">
                        <div className="flex items-start gap-4">
                            <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] w-6 mt-0.5">
                                01
                            </span>
                            <div>
                                <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                    Decisions Visible to Applicants
                                </p>
                                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm mt-0.5">
                                    {decisionsReleased
                                        ? "Applicants can currently see their decision letters in the portal."
                                        : `Decisions are hidden. Turning this on will notify ${releaseNotifyApplicants.length} applicant${releaseNotifyApplicants.length !== 1 ? "s" : ""} who haven't been notified yet.`}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                if (!decisionsReleased) {
                                    setConfirmAction("release");
                                } else {
                                    handleToggleRelease();
                                }
                            }}
                            className={`relative w-12 h-6 transition-colors shrink-0 ${decisionsReleased ? "bg-black" : "bg-[#dbe0ec]"}`}
                        >
                            <div
                                className={`absolute top-1 w-4 h-4 bg-white transition-all ${decisionsReleased ? "left-7" : "left-1"}`}
                            />
                        </button>
                    </div>
                    {confirmAction === "release" && (
                        <div className="border-t border-[#dbe0ec] px-6 py-4 bg-[#f9f9f7]">
                            <p className="font-['Source_Serif_4',serif] text-black text-sm mb-3">
                                Release decisions to all applicants and send a
                                portal-open notification to{" "}
                                <strong>
                                    {releaseNotifyApplicants.length}
                                </strong>{" "}
                                applicant
                                {releaseNotifyApplicants.length !== 1
                                    ? "s"
                                    : ""}{" "}
                                who haven't been notified yet?
                            </p>
                            {releaseNotifyApplicants.length > 0 && (
                                <div className="max-h-36 overflow-y-auto border border-[#dbe0ec] bg-white mb-4">
                                    {releaseNotifyApplicants.map((app: any) => (
                                        <div
                                            key={app.id}
                                            className="px-4 py-1.5 border-b border-[#dbe0ec] last:border-0 font-['Source_Serif_4',serif] text-sm text-black"
                                        >
                                            {app.profiles?.first_name}{" "}
                                            {app.profiles?.last_name}
                                            <span className="text-[#6c6c6c] ml-2 font-['Geist_Mono',monospace] text-[11px]">
                                                {app.profiles?.email}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="flex items-center justify-end gap-3">
                                <button
                                    onClick={() => setConfirmAction(null)}
                                    className="font-['Geist_Mono',monospace] text-[12px] text-[#6c6c6c] hover:text-black border border-[#dbe0ec] px-4 py-2 hover:border-black transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleToggleRelease}
                                    disabled={sending}
                                    className="bg-black font-['Geist_Mono',monospace] text-[12px] text-white px-4 py-2 hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {sending ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : null}
                                    Yes, Release & Notify
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Interview Invitations */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                        Interview Invitations
                    </h2>
                    <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                        002
                    </span>
                </div>
                <div className="border border-[#dbe0ec]">
                    <div className="flex items-center justify-between px-6 py-5">
                        <div className="flex items-start gap-4">
                            <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] w-6 mt-0.5">
                                01
                            </span>
                            <div>
                                <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                    Send Interview Invitations
                                </p>
                                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm mt-0.5">
                                    {interviewCandidates.length} pending
                                    {allInterviewApps.length -
                                        interviewCandidates.length >
                                    0
                                        ? ` · ${allInterviewApps.length - interviewCandidates.length} already sent`
                                        : ""}{" "}
                                    · {allInterviewApps.length} total with{" "}
                                    <span className="font-['Geist_Mono',monospace] text-[11px]">
                                        interview_scheduled
                                    </span>
                                </p>
                            </div>
                        </div>
                        {confirmAction !== "interview" && (
                            <button
                                onClick={() => setConfirmAction("interview")}
                                disabled={
                                    sending || interviewCandidates.length === 0
                                }
                                className="border border-[#dbe0ec] flex gap-[10px] items-center justify-center px-4 py-2.5 hover:border-black transition-colors disabled:opacity-50 shrink-0"
                            >
                                <span className="font-['Geist_Mono',monospace] text-[12px] text-black whitespace-nowrap leading-none">
                                    {interviewCandidates.length === 0
                                        ? allInterviewApps.length > 0
                                            ? "All Sent"
                                            : "No Candidates"
                                        : `Send (${interviewCandidates.length})`}
                                </span>
                            </button>
                        )}
                    </div>
                    {confirmAction === "interview" && (
                        <div className="border-t border-[#dbe0ec] px-6 py-4 bg-[#f9f9f7]">
                            <p className="font-['Source_Serif_4',serif] text-black text-sm mb-3">
                                Send interview invitation emails with Cal.com
                                booking link to{" "}
                                <strong>{interviewCandidates.length}</strong>{" "}
                                candidate
                                {interviewCandidates.length !== 1 ? "s" : ""}?
                            </p>
                            {interviewCandidates.length > 0 && (
                                <div className="max-h-36 overflow-y-auto border border-[#dbe0ec] bg-white mb-4">
                                    {interviewCandidates.map((app: any) => {
                                        const positions = (
                                            app.application_positions || []
                                        )
                                            .map(
                                                (ap: any) =>
                                                    ap.positions?.title,
                                            )
                                            .filter(Boolean)
                                            .join(", ");
                                        return (
                                            <div
                                                key={app.id}
                                                className="px-4 py-1.5 border-b border-[#dbe0ec] last:border-0 font-['Source_Serif_4',serif] text-sm text-black"
                                            >
                                                {app.profiles?.first_name}{" "}
                                                {app.profiles?.last_name}
                                                {positions && (
                                                    <span className="text-[#6c6c6c] ml-2">
                                                        — {positions}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="flex items-center justify-end gap-3">
                                <button
                                    onClick={() => setConfirmAction(null)}
                                    disabled={sending}
                                    className="font-['Geist_Mono',monospace] text-[12px] text-[#6c6c6c] hover:text-black border border-[#dbe0ec] px-4 py-2 hover:border-black transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSendInterviewInvitations}
                                    disabled={sending}
                                    className="bg-black font-['Geist_Mono',monospace] text-[12px] text-white px-4 py-2 hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {sending ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : null}
                                    Yes, Send
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Send Decisions */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                        Send Decisions
                    </h2>
                    <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                        003
                    </span>
                </div>
                <div className="border border-[#dbe0ec] space-y-0">
                    {/* Acceptance */}
                    <div className="flex items-center justify-between px-6 py-5">
                        <div className="flex items-start gap-4">
                            <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] w-6 mt-0.5">
                                01
                            </span>
                            <div>
                                <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                    Send Acceptance Letters
                                </p>
                                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm mt-0.5">
                                    {pendingAccepted.length} pending
                                    {alreadySentAccepted > 0
                                        ? ` · ${alreadySentAccepted} already sent`
                                        : ""}{" "}
                                    · {acceptedPositions.length} total accepted
                                </p>
                            </div>
                        </div>
                        {confirmAction !== "accepted" && (
                            <button
                                onClick={() => setConfirmAction("accepted")}
                                disabled={
                                    sending || pendingAccepted.length === 0
                                }
                                className="bg-black flex gap-[10px] items-center justify-center px-4 py-2.5 hover:bg-zinc-800 transition-colors disabled:opacity-50 shrink-0"
                            >
                                <span className="font-['Geist_Mono',monospace] text-[12px] text-white whitespace-nowrap leading-none">
                                    {pendingAccepted.length === 0
                                        ? "All Sent"
                                        : `Send (${pendingAccepted.length})`}
                                </span>
                            </button>
                        )}
                    </div>
                    {confirmAction === "accepted" && (
                        <div className="border-t border-[#dbe0ec] px-6 py-4 bg-[#f9f9f7]">
                            <p className="font-['Source_Serif_4',serif] text-black text-sm mb-3">
                                Send acceptance emails to{" "}
                                <strong>{pendingAccepted.length}</strong>{" "}
                                applicant
                                {pendingAccepted.length !== 1 ? "s" : ""}? This
                                cannot be undone.
                            </p>
                            {pendingAccepted.length > 0 && (
                                <div className="max-h-36 overflow-y-auto border border-[#dbe0ec] bg-white mb-4">
                                    {pendingAccepted.map((ap: any) => (
                                        <div
                                            key={ap.id}
                                            className="px-4 py-1.5 border-b border-[#dbe0ec] last:border-0 font-['Source_Serif_4',serif] text-sm text-black"
                                        >
                                            {ap.profiles?.first_name}{" "}
                                            {ap.profiles?.last_name}
                                            <span className="text-[#6c6c6c] ml-2">
                                                —{" "}
                                                {ap.positions?.title ||
                                                    "position"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="flex items-center justify-end gap-3">
                                <button
                                    onClick={() => setConfirmAction(null)}
                                    disabled={sending}
                                    className="font-['Geist_Mono',monospace] text-[12px] text-[#6c6c6c] hover:text-black border border-[#dbe0ec] px-4 py-2 hover:border-black transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() =>
                                        handleSendDecisions(
                                            "accepted",
                                            acceptedPositions,
                                        )
                                    }
                                    disabled={sending}
                                    className="bg-black font-['Geist_Mono',monospace] text-[12px] text-white px-4 py-2 hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {sending ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : null}
                                    Yes, Send
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Rejection */}
                    <div className="flex items-center justify-between px-6 py-5 border-t border-[#dbe0ec]">
                        <div className="flex items-start gap-4">
                            <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] w-6 mt-0.5">
                                02
                            </span>
                            <div>
                                <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                    Send Rejection Letters
                                </p>
                                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm mt-0.5">
                                    {pendingRejected.length} pending
                                    {alreadySentRejected > 0
                                        ? ` · ${alreadySentRejected} already sent`
                                        : ""}{" "}
                                    · {rejectedPositions.length} total rejected
                                </p>
                            </div>
                        </div>
                        {confirmAction !== "rejected" && (
                            <button
                                onClick={() => setConfirmAction("rejected")}
                                disabled={
                                    sending || pendingRejected.length === 0
                                }
                                className="border border-[#dbe0ec] flex gap-[10px] items-center justify-center px-4 py-2.5 hover:border-black transition-colors disabled:opacity-50 shrink-0"
                            >
                                <span className="font-['Geist_Mono',monospace] text-[12px] text-black whitespace-nowrap leading-none">
                                    {pendingRejected.length === 0
                                        ? "All Sent"
                                        : `Send (${pendingRejected.length})`}
                                </span>
                            </button>
                        )}
                    </div>
                    {confirmAction === "rejected" && (
                        <div className="border-t border-[#dbe0ec] px-6 py-4 bg-[#f9f9f7]">
                            <p className="font-['Source_Serif_4',serif] text-black text-sm mb-3">
                                Send rejection emails to{" "}
                                <strong>{pendingRejected.length}</strong>{" "}
                                applicant
                                {pendingRejected.length !== 1 ? "s" : ""}? This
                                cannot be undone.
                            </p>
                            {pendingRejected.length > 0 && (
                                <div className="max-h-36 overflow-y-auto border border-[#dbe0ec] bg-white mb-4">
                                    {pendingRejected.map((ap: any) => (
                                        <div
                                            key={ap.id}
                                            className="px-4 py-1.5 border-b border-[#dbe0ec] last:border-0 font-['Source_Serif_4',serif] text-sm text-black"
                                        >
                                            {ap.profiles?.first_name}{" "}
                                            {ap.profiles?.last_name}
                                            <span className="text-[#6c6c6c] ml-2">
                                                —{" "}
                                                {ap.positions?.title ||
                                                    "position"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="flex items-center justify-end gap-3">
                                <button
                                    onClick={() => setConfirmAction(null)}
                                    disabled={sending}
                                    className="font-['Geist_Mono',monospace] text-[12px] text-[#6c6c6c] hover:text-black border border-[#dbe0ec] px-4 py-2 hover:border-black transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() =>
                                        handleSendDecisions(
                                            "rejected",
                                            rejectedPositions,
                                        )
                                    }
                                    disabled={sending}
                                    className="bg-black font-['Geist_Mono',monospace] text-[12px] text-white px-4 py-2 hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {sending ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : null}
                                    Yes, Send
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {sentCount > 0 && (
                    <div className="mt-3 flex items-center justify-between">
                        <p className="font-['Source_Serif_4',serif] text-black text-sm">
                            Successfully sent {sentCount} decision letter
                            {sentCount !== 1 ? "s" : ""}.
                        </p>
                        {!decisionsReleased && (
                            <button
                                onClick={() => setConfirmAction("release")}
                                className="font-['Geist_Mono',monospace] text-[12px] text-black underline hover:no-underline"
                            >
                                Release decisions to applicants now
                            </button>
                        )}
                    </div>
                )}
            </section>

            {/* How it works */}
            <section>
                <div className="flex items-center justify-between py-5 border-t border-[#dbe0ec]">
                    <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                        How Decisions Work
                    </h2>
                    <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                        004
                    </span>
                </div>
                <div className="border border-[#dbe0ec]">
                    <div className="px-6 py-4 bg-[#f9f9f7] border-b border-[#dbe0ec]">
                        <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm leading-[1.5]">
                            Emails are only sent when you explicitly click the
                            send buttons above — status changes do not trigger
                            emails. Releasing decisions sends a "portal is open"
                            notification to all applicants, then they can view
                            their letters once sent from this page.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#dbe0ec]">
                        {[
                            {
                                step: "01",
                                title: "Review Applications",
                                desc: "Score and evaluate each applicant in the review page.",
                            },
                            {
                                step: "02",
                                title: "Set Statuses",
                                desc: "Mark applications as Accepted, Rejected, or Interview Scheduled from the dashboard or review page.",
                            },
                            {
                                step: "03",
                                title: "Send Acceptance / Rejection Emails",
                                desc: "Use the send buttons above to deliver decision letters. Already-sent decisions are skipped automatically.",
                            },
                            {
                                step: "04",
                                title: "Release & Notify",
                                desc: "Toggle 'Decisions Visible' to open the portal. All applicants receive a one-time portal-open notification.",
                            },
                        ].map((item) => (
                            <div key={item.step} className="px-6 py-4">
                                <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                    {item.step}
                                </span>
                                <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm mt-1">
                                    {item.title}
                                </p>
                                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm mt-0.5">
                                    {item.desc}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
