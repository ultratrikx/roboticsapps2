import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";
import { STATUS_LABELS } from "../../data";
import { cn } from "../../lib/utils";

const POSITION_STATUSES = [
    "pending",
    "interview_scheduled",
    "accepted",
    "rejected",
] as const;
type PositionStatus = (typeof POSITION_STATUSES)[number];

const POSITION_STATUS_LABELS: Record<string, string> = {
    pending: "Pending",
    interview_scheduled: "Interview",
    accepted: "Accepted",
    rejected: "Declined",
};

export function AdminApplicationReview() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { profile: adminProfile } = useAuth();
    const [application, setApplication] = useState<any>(null);
    const [applicantProfile, setApplicantProfile] = useState<any>(null);
    const [activities, setActivities] = useState<any[]>([]);
    const [responses, setResponses] = useState<any[]>([]);
    const [honors, setHonors] = useState<any[]>([]);
    const [scores, setScores] = useState<Record<string, number>>({});
    const [positionScores, setPositionScores] = useState<Record<string, Record<string, number>>>({});
    const [selectedScoringPosition, setSelectedScoringPosition] = useState<string>("overall");
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [allReviews, setAllReviews] = useState<any[]>([]);
    const [updatingPositionId, setUpdatingPositionId] = useState<string | null>(
        null,
    );
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deletePassword, setDeletePassword] = useState("");
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [interviewNotes, setInterviewNotes] = useState<any[]>([]);
    const [myInterviewNote, setMyInterviewNote] = useState("");
    const [reviewSaving, setReviewSaving] = useState(false);
    const [reviewSaved, setReviewSaved] = useState(false);
    const [interviewNoteSaving, setInterviewNoteSaving] = useState(false);
    const [interviewNoteSaved, setInterviewNoteSaved] = useState(false);

    // Stable refs so debounce callbacks always read current values
    const applicationRef = useRef<any>(null);
    const adminProfileRef = useRef<any>(null);
    const scoresRef = useRef<Record<string, number>>({});
    const positionScoresRef = useRef<Record<string, Record<string, number>>>({});
    const notesRef = useRef("");
    const myInterviewNoteRef = useRef("");
    const dataLoadedRef = useRef(false);
    const reviewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const interviewNoteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const RUBRIC = [
        { id: "experience", label: "Relevant Experience" },
        { id: "essay", label: "Response Quality" },
        { id: "leadership", label: "Leadership Potential" },
        { id: "fit", label: "Team Fit" },
    ];

    useEffect(() => {
        const fetchData = async () => {
            // Fetch application first (needed to get user_id for parallel queries)
            const { data: app } = await supabase
                .from("applications")
                .select(
                    "*, application_positions(*, positions(title, description, spots))",
                )
                .eq("id", id)
                .single();
            setApplication(app);

            if (app) {
                // Fetch all related data in parallel
                const [profResult, actsResult, respsResult, honsResult, revsResult, intNotesResult] = await Promise.all([
                    supabase.from("profiles").select("*").eq("id", app.user_id).single(),
                    supabase.from("activities").select("*").eq("user_id", app.user_id).order("sort_order"),
                    supabase.from("responses").select("*, questions(prompt)").eq("application_id", app.id),
                    supabase.from("honors").select("*").eq("user_id", app.user_id).order("sort_order"),
                    supabase.from("reviews").select("*, profiles:reviewer_id(first_name, last_name, email)").eq("application_id", app.id).order("updated_at", { ascending: false }),
                    supabase.from("interview_notes").select("*, profiles:admin_user_id(first_name, last_name, email)").eq("application_id", app.id).order("updated_at", { ascending: false }),
                ]);

                setApplicantProfile(profResult.data);
                setActivities(actsResult.data || []);
                setResponses(respsResult.data || []);
                setHonors(honsResult.data || []);
                setAllReviews(revsResult.data || []);
                setInterviewNotes(intNotesResult.data || []);

                // Set current admin's scores/notes into edit state
                if (adminProfile && revsResult.data) {
                    const myReview = revsResult.data.find(
                        (r: any) => r.reviewer_id === adminProfile.id,
                    );
                    if (myReview) {
                        setScores(myReview.scores || {});
                        setPositionScores(myReview.position_scores || {});
                        setNotes(myReview.notes || "");
                    }
                }

                // Set current admin's interview note
                if (adminProfile && intNotesResult.data) {
                    const myNote = intNotesResult.data.find(
                        (n: any) => n.admin_user_id === adminProfile.id,
                    );
                    setMyInterviewNote(myNote?.content || "");
                }
            }
            dataLoadedRef.current = true;
            setLoading(false);
        };
        fetchData();
    }, [id, adminProfile]);

    // Keep refs in sync with state so debounce callbacks read current values
    useEffect(() => { applicationRef.current = application; }, [application]);
    useEffect(() => { adminProfileRef.current = adminProfile; }, [adminProfile]);
    useEffect(() => { scoresRef.current = scores; }, [scores]);
    useEffect(() => { positionScoresRef.current = positionScores; }, [positionScores]);
    useEffect(() => { notesRef.current = notes; }, [notes]);
    useEffect(() => { myInterviewNoteRef.current = myInterviewNote; }, [myInterviewNote]);

    // Autosave review (scores + position scores + notes) with 1s debounce
    useEffect(() => {
        if (!dataLoadedRef.current) return;
        if (reviewDebounceRef.current) clearTimeout(reviewDebounceRef.current);
        reviewDebounceRef.current = setTimeout(async () => {
            const app = applicationRef.current;
            const prof = adminProfileRef.current;
            if (!app || !prof) return;
            setReviewSaving(true);
            setReviewSaved(false);
            const payload = {
                scores: scoresRef.current,
                position_scores: positionScoresRef.current,
                notes: notesRef.current,
                updated_at: new Date().toISOString(),
            };
            const { data: existing } = await supabase
                .from("reviews")
                .select("id")
                .eq("application_id", app.id)
                .eq("reviewer_id", prof.id)
                .maybeSingle();
            let err;
            if (existing) {
                ({ error: err } = await supabase.from("reviews").update(payload).eq("id", existing.id));
            } else {
                ({ error: err } = await supabase.from("reviews").insert({ application_id: app.id, reviewer_id: prof.id, ...payload }));
            }
            if (!err) {
                setReviewSaved(true);
                const { data: allRevs } = await supabase
                    .from("reviews")
                    .select("*, profiles:reviewer_id(first_name, last_name, email)")
                    .eq("application_id", app.id)
                    .order("updated_at", { ascending: false });
                setAllReviews(allRevs || []);
                setTimeout(() => setReviewSaved(false), 2000);
            } else {
                console.error("Failed to autosave review:", err);
            }
            setReviewSaving(false);
        }, 1000);
        return () => { if (reviewDebounceRef.current) clearTimeout(reviewDebounceRef.current); };
    }, [scores, positionScores, notes]);

    // Autosave interview note with 1s debounce
    useEffect(() => {
        if (!dataLoadedRef.current) return;
        if (interviewNoteDebounceRef.current) clearTimeout(interviewNoteDebounceRef.current);
        interviewNoteDebounceRef.current = setTimeout(async () => {
            const app = applicationRef.current;
            const prof = adminProfileRef.current;
            if (!app || !prof) return;
            setInterviewNoteSaving(true);
            setInterviewNoteSaved(false);
            const content = myInterviewNoteRef.current;
            const { error: err } = await supabase
                .from("interview_notes")
                .upsert(
                    { application_id: app.id, admin_user_id: prof.id, content, updated_at: new Date().toISOString() },
                    { onConflict: "application_id,admin_user_id" },
                );
            if (!err) {
                setInterviewNoteSaved(true);
                setInterviewNotes((prev) => {
                    const existing = prev.find((n) => n.admin_user_id === prof.id);
                    if (existing) {
                        return prev.map((n) =>
                            n.admin_user_id === prof.id
                                ? { ...n, content, updated_at: new Date().toISOString() }
                                : n,
                        );
                    }
                    return [...prev, {
                        admin_user_id: prof.id,
                        application_id: app.id,
                        content,
                        updated_at: new Date().toISOString(),
                        profiles: { first_name: prof.first_name, last_name: prof.last_name, email: prof.email },
                    }];
                });
                setTimeout(() => setInterviewNoteSaved(false), 2000);
            } else {
                console.error("Failed to autosave interview note:", err);
            }
            setInterviewNoteSaving(false);
        }, 1000);
        return () => { if (interviewNoteDebounceRef.current) clearTimeout(interviewNoteDebounceRef.current); };
    }, [myInterviewNote]);


    const handleUpdateStatus = async (status: string) => {
        if (!application) return;
        setError(null);
        const { error: err } = await supabase
            .from("applications")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", application.id);
        if (err) {
            console.error("Failed to update application status:", err);
            setError(`Failed to update status: ${err.message}`);
            return;
        }
        setApplication({ ...application, status });
    };

    const handleUpdatePositionStatus = async (
        applicationPositionId: string,
        status: PositionStatus,
    ) => {
        if (!application) return;
        setError(null);
        setUpdatingPositionId(applicationPositionId);

        const { error: err } = await supabase
            .from("application_positions")
            .update({ status })
            .eq("id", applicationPositionId);

        if (err) {
            console.error("Failed to update position status:", err);
            setError(`Failed to update position status: ${err.message}`);
        } else {
            setApplication({
                ...application,
                application_positions: application.application_positions.map(
                    (ap: any) =>
                        ap.id === applicationPositionId
                            ? { ...ap, status }
                            : ap,
                ),
            });
        }
        setUpdatingPositionId(null);
    };

    const handleDeleteApplication = async () => {
        if (deletePassword !== "wosswossshowthemwhosboss") {
            setDeleteError("Incorrect password. Please try again.");
            return;
        }
        if (!application) return;
        setDeleting(true);
        setDeleteError(null);
        const { error: err } = await supabase
            .from("applications")
            .delete()
            .eq("id", application.id);
        if (err) {
            setDeleteError(`Failed to delete: ${err.message}`);
            setDeleting(false);
            return;
        }
        toast.success("Application deleted.");
        navigate("/admin");
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="w-6 h-6 animate-spin text-[#6c6c6c]" />
            </div>
        );
    }

    if (!application) {
        return (
            <p className="text-center py-24 text-[#6c6c6c]">
                Application not found.
            </p>
        );
    }

    const applicantName = applicantProfile
        ? `${applicantProfile.first_name || ""} ${applicantProfile.last_name || ""}`.trim() ||
          applicantProfile.email
        : "Unknown";

    const appliedPositions: any[] = [...(application.application_positions || [])]
        .sort((a: any, b: any) => (a.position_rank ?? 999) - (b.position_rank ?? 999));
    const positionTitles = appliedPositions
        .map((ap: any) => ap.positions?.title)
        .filter(Boolean)
        .join(", ");

    return (
        <>
        <div className="h-[calc(100vh-3.5rem)] flex flex-col -m-8">
            {/* Header */}
            <header className="h-14 px-6 flex items-center justify-between border-b border-[#dbe0ec] bg-white shrink-0">
                <div className="flex items-center gap-4">
                    <Link
                        to="/admin"
                        className="text-[#6c6c6c] hover:text-black transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <div className="flex items-center gap-3">
                        <h1 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                            {applicantName}
                        </h1>
                        <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                            {positionTitles || "No positions"} ·{" "}
                            {applicantProfile?.grade || ""}
                        </span>
                        <span className="font-['Geist_Mono',monospace] text-[10px] border border-[#6c6c6c] text-[#6c6c6c] px-2 py-0.5">
                            {STATUS_LABELS[application.status] ||
                                application.status}
                        </span>
                    </div>
                </div>
            </header>

            {/* Two-pane layout */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left pane: Application content */}
                <div className="flex-1 overflow-y-auto bg-[#f9f9f7]">
                    <div className="max-w-3xl mx-auto p-8 space-y-6">
                        {/* Profile */}
                        <section className="bg-white border border-[#dbe0ec]">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-[#dbe0ec]">
                                <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em]">
                                    Profile
                                </p>
                                <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                    001
                                </span>
                            </div>
                            <div className="px-6 py-5 grid grid-cols-2 gap-5">
                                {[
                                    { label: "Name", value: applicantName },
                                    {
                                        label: "Grade",
                                        value: applicantProfile?.grade || "—",
                                    },
                                    {
                                        label: "Email",
                                        value: applicantProfile?.email || "—",
                                    },
                                    {
                                        label: "Applied Positions (by preference)",
                                        value: appliedPositions
                                            .map((ap: any) => `#${ap.position_rank ?? "?"} ${ap.positions?.title}`)
                                            .filter(Boolean)
                                            .join(", ") || "—",
                                    },
                                    {
                                        label: "Student Number",
                                        value:
                                            applicantProfile?.student_number ||
                                            "—",
                                    },
                                    {
                                        label: "Phone",
                                        value: applicantProfile?.phone || "—",
                                    },
                                ].map((item) => (
                                    <div key={item.label}>
                                        <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em] mb-1">
                                            {item.label}
                                        </p>
                                        <p className="font-['Radio_Canada_Big',sans-serif] text-black text-sm">
                                            {item.value}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Positions */}
                        {appliedPositions.length > 0 && (
                            <section className="bg-white border border-[#dbe0ec]">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-[#dbe0ec]">
                                    <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em]">
                                        Positions Applied
                                    </p>
                                    <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                        002
                                    </span>
                                </div>
                                {appliedPositions.map((ap: any, i: number) => (
                                    <div
                                        key={ap.id}
                                        className={cn(
                                            "px-6 py-5",
                                            i !== 0 &&
                                                "border-t border-[#dbe0ec]",
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    {ap.position_rank != null && (
                                                        <span className="font-['Geist_Mono',monospace] text-[10px] text-white bg-black px-1.5 py-0.5 shrink-0">
                                                            #{ap.position_rank}
                                                        </span>
                                                    )}
                                                    <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                                        {ap.positions?.title ||
                                                            "Unknown Position"}
                                                    </p>
                                                </div>
                                                {ap.positions?.description && (
                                                    <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm leading-[1.5]">
                                                        {
                                                            ap.positions
                                                                .description
                                                        }
                                                    </p>
                                                )}
                                            </div>
                                            <span
                                                className={cn(
                                                    "font-['Geist_Mono',monospace] text-[10px] border px-2 py-0.5 shrink-0",
                                                    ap.status === "accepted"
                                                        ? "bg-black border-black text-white"
                                                        : ap.status ===
                                                            "rejected"
                                                          ? "border-[#dbe0ec] text-[#6c6c6c] line-through"
                                                          : "border-[#6c6c6c] text-[#6c6c6c]",
                                                )}
                                            >
                                                {POSITION_STATUS_LABELS[
                                                    ap.status
                                                ] || ap.status}
                                            </span>
                                        </div>
                                        {/* Position decision controls — only show when application is accepted */}
                                        {application.status === "accepted" && (
                                            <div className="mt-3 flex items-center gap-1.5">
                                                {POSITION_STATUSES.map(
                                                    (status) => (
                                                        <button
                                                            key={status}
                                                            disabled={
                                                                updatingPositionId ===
                                                                ap.id
                                                            }
                                                            onClick={() =>
                                                                handleUpdatePositionStatus(
                                                                    ap.id,
                                                                    status,
                                                                )
                                                            }
                                                            className={cn(
                                                                "px-2.5 py-1 border font-['Geist_Mono',monospace] text-[10px] transition-colors",
                                                                ap.status ===
                                                                    status
                                                                    ? "bg-black border-black text-white"
                                                                    : "border-[#dbe0ec] text-[#6c6c6c] hover:border-black hover:text-black",
                                                            )}
                                                        >
                                                            {
                                                                POSITION_STATUS_LABELS[
                                                                    status
                                                                ]
                                                            }
                                                        </button>
                                                    ),
                                                )}
                                                {updatingPositionId ===
                                                    ap.id && (
                                                    <Loader2 className="w-3 h-3 animate-spin text-[#6c6c6c] ml-1" />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </section>
                        )}

                        {/* Activities */}
                        {activities.length > 0 && (
                            <section className="bg-white border border-[#dbe0ec]">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-[#dbe0ec]">
                                    <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em]">
                                        Activities
                                    </p>
                                    <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                        003
                                    </span>
                                </div>
                                {activities.map((act, i) => (
                                    <div
                                        key={act.id}
                                        className={cn(
                                            "px-6 py-5",
                                            i !== 0 &&
                                                "border-t border-[#dbe0ec]",
                                        )}
                                    >
                                        <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm mb-1">
                                            {act.role || "Role not specified"}{" "}
                                            {act.organization
                                                ? `at ${act.organization}`
                                                : ""}
                                        </p>
                                        {act.type && (
                                            <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase mb-1">
                                                {act.type}
                                            </p>
                                        )}
                                        <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm leading-[1.5]">
                                            {act.description}
                                        </p>
                                    </div>
                                ))}
                            </section>
                        )}

                        {/* Honors */}
                        {honors.length > 0 && (
                            <section className="bg-white border border-[#dbe0ec]">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-[#dbe0ec]">
                                    <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em]">
                                        Honors & Awards
                                    </p>
                                    <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                        004
                                    </span>
                                </div>
                                {honors.map((h, i) => (
                                    <div
                                        key={h.id}
                                        className={cn(
                                            "px-6 py-4",
                                            i !== 0 &&
                                                "border-t border-[#dbe0ec]",
                                        )}
                                    >
                                        <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                            {h.title}
                                        </p>
                                        <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] mt-0.5">
                                            {h.grade_level} ·{" "}
                                            {h.recognition_level}
                                        </p>
                                    </div>
                                ))}
                            </section>
                        )}

                        {/* Responses */}
                        {responses.length > 0 && (
                            <section className="bg-white border border-[#dbe0ec]">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-[#dbe0ec]">
                                    <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em]">
                                        Written Responses
                                    </p>
                                    <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                        005
                                    </span>
                                </div>
                                {responses.map((resp, i) => (
                                    <div
                                        key={resp.id}
                                        className={cn(
                                            "px-6 py-5",
                                            i !== 0 &&
                                                "border-t border-[#dbe0ec]",
                                        )}
                                    >
                                        <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm mb-3">
                                            {resp.questions?.prompt ||
                                                "Question"}
                                        </p>
                                        <p className="font-['Source_Serif_4',serif] text-black text-base leading-[1.6] tracking-[-0.2px] bg-[#f9f9f7] border border-[#dbe0ec] px-5 py-4 whitespace-pre-wrap">
                                            {resp.content || "(No response)"}
                                        </p>
                                    </div>
                                ))}
                            </section>
                        )}

                        {/* Interview Notes — visible once application reaches interview stage */}
                        {["interview_scheduled", "accepted", "rejected"].includes(application.status) && (
                            <section className="bg-white border-2 border-black">
                                <div className="flex items-center justify-between px-6 py-4 border-b-2 border-black bg-black">
                                    <p className="font-['Geist_Mono',monospace] text-[10px] text-white uppercase tracking-[0.08em]">
                                        Interview Notes
                                    </p>
                                    <span className="font-['Geist_Mono',monospace] text-[10px] text-[#aaaaaa]">
                                        006
                                    </span>
                                </div>

                                {/* Current admin's editable note */}
                                <div className="px-6 py-5 border-b border-[#dbe0ec]">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                            {adminProfile
                                                ? `${adminProfile.first_name || ""} ${adminProfile.last_name || ""}`.trim() || adminProfile.email
                                                : "Your Notes"}
                                            <span className="ml-2 font-['Geist_Mono',monospace] text-[10px] text-white bg-black px-1.5 py-0.5">
                                                you
                                            </span>
                                        </p>
                                        <span className={cn(
                                            "font-['Geist_Mono',monospace] text-[10px] transition-opacity",
                                            interviewNoteSaving || interviewNoteSaved ? "opacity-100" : "opacity-0"
                                        )}>
                                            {interviewNoteSaving
                                                ? <span className="text-[#6c6c6c] flex items-center gap-1"><Loader2 className="w-2.5 h-2.5 animate-spin" /> saving</span>
                                                : <span className="text-black">saved</span>
                                            }
                                        </span>
                                    </div>
                                    <textarea
                                        className="w-full h-36 border border-[#dbe0ec] bg-[#f9f9f7] px-4 py-3 font-['Source_Serif_4',serif] text-sm text-black leading-relaxed resize-none outline-none focus:border-black transition-colors placeholder-[#6c6c6c]"
                                        placeholder="Add your interview notes here — autosaves as you type..."
                                        value={myInterviewNote}
                                        onChange={(e) => setMyInterviewNote(e.target.value)}
                                    />
                                </div>

                                {/* Other admins' notes (read-only) */}
                                {interviewNotes.filter((n) => n.admin_user_id !== adminProfile?.id && n.content?.trim()).map((note, i) => {
                                    const prof = note.profiles;
                                    const firstName = prof?.first_name || "";
                                    const lastName = prof?.last_name || "";
                                    const name = `${firstName} ${lastName}`.trim() || prof?.email || "Unknown";
                                    const initials = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || "?";
                                    return (
                                        <div key={note.id || note.admin_user_id} className={cn("px-6 py-5", i !== 0 && "border-t border-[#dbe0ec]")}>
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="w-6 h-6 bg-black flex items-center justify-center shrink-0">
                                                    <span className="font-['Geist_Mono',monospace] text-[9px] text-white leading-none">
                                                        {initials}
                                                    </span>
                                                </div>
                                                <span className="font-['Radio_Canada_Big',sans-serif] text-black text-sm font-medium">
                                                    {name}
                                                </span>
                                                {note.updated_at && (
                                                    <span className="font-['Geist_Mono',monospace] text-[9px] text-[#6c6c6c] ml-auto">
                                                        {new Date(note.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="font-['Source_Serif_4',serif] text-black text-sm leading-relaxed bg-[#f9f9f7] border border-[#dbe0ec] px-5 py-4 whitespace-pre-wrap">
                                                {note.content}
                                            </p>
                                        </div>
                                    );
                                })}

                                {/* Empty state if no one else has notes yet */}
                                {interviewNotes.filter((n) => n.admin_user_id !== adminProfile?.id && n.content?.trim()).length === 0 && (
                                    <div className="px-6 py-4">
                                        <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                            No notes from other reviewers yet.
                                        </p>
                                    </div>
                                )}
                            </section>
                        )}
                    </div>
                </div>

                {/* Right pane: Rubric */}
                <div className="w-72 bg-white border-l border-[#dbe0ec] flex flex-col shrink-0">
                    <div className="px-5 py-4 border-b border-[#dbe0ec]">
                        <div className="flex items-center justify-between mb-3">
                            <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em]">
                                Reviewer Rubric
                            </p>
                            <span className={cn(
                                "font-['Geist_Mono',monospace] text-[10px] transition-opacity flex items-center gap-1",
                                reviewSaving || reviewSaved ? "opacity-100" : "opacity-0"
                            )}>
                                {reviewSaving
                                    ? <><Loader2 className="w-2.5 h-2.5 animate-spin text-[#6c6c6c]" /><span className="text-[#6c6c6c]">saving</span></>
                                    : <span className="text-black">saved</span>
                                }
                            </span>
                        </div>
                        {/* Scoring context: Overall + one tab per position */}
                        {appliedPositions.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                <button
                                    onClick={() => setSelectedScoringPosition("overall")}
                                    className={cn(
                                        "px-2 py-1 font-['Geist_Mono',monospace] text-[10px] border transition-colors",
                                        selectedScoringPosition === "overall"
                                            ? "bg-black border-black text-white"
                                            : "border-[#dbe0ec] text-[#6c6c6c] hover:border-black hover:text-black"
                                    )}
                                >
                                    Overall
                                </button>
                                {appliedPositions.map((ap: any) => (
                                    <button
                                        key={ap.position_id || ap.id}
                                        onClick={() => setSelectedScoringPosition(ap.position_id || ap.id)}
                                        className={cn(
                                            "px-2 py-1 font-['Geist_Mono',monospace] text-[10px] border transition-colors",
                                            selectedScoringPosition === (ap.position_id || ap.id)
                                                ? "bg-black border-black text-white"
                                                : "border-[#dbe0ec] text-[#6c6c6c] hover:border-black hover:text-black"
                                        )}
                                    >
                                        {ap.positions?.title?.split(" ").slice(0, 2).join(" ") || "?"}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                        {error && (
                            <div className="border border-red-300 bg-red-50 px-4 py-3">
                                <p className="font-['Geist_Mono',monospace] text-[11px] text-red-700">
                                    {error}
                                </p>
                            </div>
                        )}
                        {/* Positions summary in right pane */}
                        {appliedPositions.length > 0 && (
                            <div>
                                <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em] mb-3">
                                    Positions
                                </p>
                                <div className="space-y-2">
                                    {appliedPositions.map((ap: any) => (
                                        <div
                                            key={ap.id}
                                            className="border border-[#dbe0ec] px-3 py-2"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-1.5">
                                                    {ap.position_rank != null && (
                                                        <span className="font-['Geist_Mono',monospace] text-[9px] text-white bg-black px-1 py-0.5 shrink-0">
                                                            #{ap.position_rank}
                                                        </span>
                                                    )}
                                                    <p className="font-['Radio_Canada_Big',sans-serif] text-black text-xs font-medium">
                                                        {ap.positions?.title ||
                                                            "Unknown"}
                                                    </p>
                                                </div>
                                                <span
                                                    className={cn(
                                                        "font-['Geist_Mono',monospace] text-[9px] px-1.5 py-0.5 border shrink-0",
                                                        ap.status === "accepted"
                                                            ? "bg-black border-black text-white"
                                                            : ap.status ===
                                                                "rejected"
                                                              ? "border-[#dbe0ec] text-[#6c6c6c] line-through"
                                                              : "border-[#6c6c6c] text-[#6c6c6c]",
                                                    )}
                                                >
                                                    {POSITION_STATUS_LABELS[
                                                        ap.status
                                                    ] || ap.status}
                                                </span>
                                            </div>
                                            {/* Only show decision controls in accepted stage */}
                                            {application.status ===
                                                "accepted" && (
                                                <div className="flex items-center gap-1 mt-1.5">
                                                    {POSITION_STATUSES.map(
                                                        (status) => (
                                                            <button
                                                                key={status}
                                                                disabled={
                                                                    updatingPositionId ===
                                                                    ap.id
                                                                }
                                                                onClick={() =>
                                                                    handleUpdatePositionStatus(
                                                                        ap.id,
                                                                        status,
                                                                    )
                                                                }
                                                                className={cn(
                                                                    "px-1.5 py-0.5 border font-['Geist_Mono',monospace] text-[9px] transition-colors",
                                                                    ap.status ===
                                                                        status
                                                                        ? "bg-black border-black text-white"
                                                                        : "border-[#dbe0ec] text-[#6c6c6c] hover:border-black hover:text-black",
                                                                )}
                                                            >
                                                                {
                                                                    POSITION_STATUS_LABELS[
                                                                        status
                                                                    ]
                                                                }
                                                            </button>
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {(() => {
                            const isOverall = selectedScoringPosition === "overall";
                            const activeScores = isOverall
                                ? scores
                                : (positionScores[selectedScoringPosition] || {});
                            const setActiveScores = (updated: Record<string, number>) => {
                                if (isOverall) {
                                    setScores(updated);
                                } else {
                                    setPositionScores({ ...positionScores, [selectedScoringPosition]: updated });
                                }
                            };
                            return RUBRIC.map((criterion) => (
                                <div key={criterion.id}>
                                    <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm mb-3">
                                        {criterion.label}
                                    </p>
                                    <div className="flex gap-1.5">
                                        {[1, 2, 3, 4, 5].map((score) => (
                                            <button
                                                key={score}
                                                onClick={() =>
                                                    setActiveScores({
                                                        ...activeScores,
                                                        [criterion.id]: score,
                                                    })
                                                }
                                                className={cn(
                                                    "w-9 h-9 border font-['Geist_Mono',monospace] text-sm transition-colors",
                                                    activeScores[criterion.id] === score
                                                        ? "bg-black border-black text-white"
                                                        : "border-[#dbe0ec] text-[#6c6c6c] hover:border-black hover:text-black",
                                                )}
                                            >
                                                {score}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ));
                        })()}

                        <div>
                            <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm mb-2">
                                Internal Notes
                            </p>
                            <textarea
                                className="w-full h-28 border border-[#dbe0ec] bg-[#f9f9f7] px-4 py-3 font-['Source_Serif_4',serif] text-sm text-black leading-relaxed resize-none outline-none focus:border-black transition-colors placeholder-[#6c6c6c]"
                                placeholder="Leave a note for other reviewers..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>

                        {(() => {
                            const isOverall = selectedScoringPosition === "overall";
                            const activeScores = isOverall
                                ? scores
                                : (positionScores[selectedScoringPosition] || {});
                            if (Object.keys(activeScores).length === 0) return null;
                            const avg = Object.values(activeScores).reduce((a, b) => a + b, 0) / Object.keys(activeScores).length;
                            const posLabel = isOverall ? "Overall Avg" : "Position Avg";
                            return (
                                <div className="border border-[#dbe0ec] px-4 py-3">
                                    <div className="flex justify-between">
                                        <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em]">
                                            {posLabel}
                                        </span>
                                        <span className="font-['Geist_Mono',monospace] text-sm text-black font-medium">
                                            {avg.toFixed(1)}
                                            <span className="text-[#6c6c6c] text-[10px]"> / 5.0</span>
                                        </span>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* All Reviews */}
                        {allReviews.filter(
                            (r) => r.reviewer_id !== adminProfile?.id,
                        ).length > 0 && (
                            <div>
                                <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em] mb-3">
                                    All Reviews
                                </p>
                                <div className="space-y-3">
                                    {allReviews
                                        .filter(
                                            (r) =>
                                                r.reviewer_id !==
                                                adminProfile?.id,
                                        )
                                        .map((review) => {
                                            const prof = review.profiles;
                                            const firstName =
                                                prof?.first_name || "";
                                            const lastName =
                                                prof?.last_name || "";
                                            const reviewerName =
                                                `${firstName} ${lastName}`.trim() ||
                                                prof?.email ||
                                                "Unknown";
                                            const initials =
                                                (
                                                    firstName.charAt(0) +
                                                    lastName.charAt(0)
                                                ).toUpperCase() || "?";
                                            const reviewScores: Record<
                                                string,
                                                number
                                            > = review.scores || {};
                                            return (
                                                <div
                                                    key={review.id}
                                                    className="border border-[#dbe0ec] px-4 py-3 space-y-2"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 bg-black flex items-center justify-center shrink-0">
                                                            <span className="font-['Geist_Mono',monospace] text-[9px] text-white leading-none">
                                                                {initials}
                                                            </span>
                                                        </div>
                                                        <span className="font-['Radio_Canada_Big',sans-serif] text-black text-xs font-medium">
                                                            {reviewerName}
                                                        </span>
                                                    </div>
                                                    {Object.keys(reviewScores)
                                                        .length > 0 && (
                                                        <div className="flex flex-wrap gap-1">
                                                            {RUBRIC.map((c) =>
                                                                reviewScores[
                                                                    c.id
                                                                ] != null ? (
                                                                    <span
                                                                        key={
                                                                            c.id
                                                                        }
                                                                        className="font-['Geist_Mono',monospace] text-[9px] border border-[#dbe0ec] text-[#6c6c6c] px-1.5 py-0.5"
                                                                    >
                                                                        {
                                                                            c.label.split(
                                                                                " ",
                                                                            )[0]
                                                                        }{" "}
                                                                        {
                                                                            reviewScores[
                                                                                c
                                                                                    .id
                                                                            ]
                                                                        }
                                                                        /5
                                                                    </span>
                                                                ) : null,
                                                            )}
                                                        </div>
                                                    )}
                                                    {review.notes && (
                                                        <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-xs leading-relaxed">
                                                            {review.notes}
                                                        </p>
                                                    )}
                                                    {review.updated_at && (
                                                        <p className="font-['Geist_Mono',monospace] text-[9px] text-[#6c6c6c]">
                                                            {new Date(
                                                                review.updated_at,
                                                            ).toLocaleDateString(
                                                                "en-US",
                                                                {
                                                                    month: "short",
                                                                    day: "numeric",
                                                                    year: "numeric",
                                                                    hour: "numeric",
                                                                    minute: "2-digit",
                                                                },
                                                            )}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-5 border-t border-[#dbe0ec] space-y-3 bg-[#f9f9f7]">
                        <button
                            onClick={() => {
                                setDeletePassword("");
                                setDeleteError(null);
                                setDeleteModalOpen(true);
                            }}
                            className="w-full border border-[#dbe0ec] flex gap-2 items-center justify-center px-5 py-2.5 hover:border-red-400 hover:text-red-600 transition-colors text-[#6c6c6c]"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="font-['Geist_Mono',monospace] text-[12px] whitespace-nowrap leading-none">
                                Delete Application
                            </span>
                        </button>

                        {/* Status Pipeline */}
                        <div className="pt-2">
                            <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em] mb-2">
                                Status Pipeline
                            </p>

                            {/* Visual pipeline indicator */}
                            <div className="flex items-center gap-1 mb-3">
                                {(
                                    [
                                        "submitted",
                                        "under_review",
                                        "interview_scheduled",
                                        "accepted",
                                    ] as const
                                ).map((step, i) => (
                                    <div
                                        key={step}
                                        className="flex items-center gap-1 flex-1"
                                    >
                                        <div
                                            className={cn(
                                                "h-1 flex-1 transition-colors",
                                                application.status === step
                                                    ? "bg-black"
                                                    : [
                                                            "submitted",
                                                            "under_review",
                                                            "interview_scheduled",
                                                            "accepted",
                                                        ].indexOf(
                                                            application.status,
                                                        ) >= i &&
                                                        application.status !==
                                                            "rejected"
                                                      ? "bg-black"
                                                      : "bg-[#dbe0ec]",
                                            )}
                                        />
                                    </div>
                                ))}
                            </div>

                            {/* Contextual action buttons based on current status */}
                            {application.status === "submitted" && (
                                <div className="space-y-2">
                                    <button
                                        onClick={() =>
                                            handleUpdateStatus("under_review")
                                        }
                                        className="w-full border border-black bg-black py-2.5 font-['Geist_Mono',monospace] text-[12px] text-white hover:bg-zinc-800 transition-colors"
                                    >
                                        Begin Review
                                    </button>
                                    <button
                                        onClick={() =>
                                            handleUpdateStatus("rejected")
                                        }
                                        className="w-full border border-[#dbe0ec] py-2.5 font-['Geist_Mono',monospace] text-[12px] text-[#6c6c6c] hover:border-black hover:text-black transition-colors"
                                    >
                                        Decline
                                    </button>
                                </div>
                            )}

                            {application.status === "under_review" && (
                                <div className="space-y-2">
                                    <button
                                        onClick={() =>
                                            handleUpdateStatus(
                                                "interview_scheduled",
                                            )
                                        }
                                        className="w-full border border-black bg-black py-2.5 font-['Geist_Mono',monospace] text-[12px] text-white hover:bg-zinc-800 transition-colors"
                                    >
                                        Advance to Interview
                                    </button>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() =>
                                                handleUpdateStatus("accepted")
                                            }
                                            className="flex-1 border border-[#dbe0ec] py-2.5 font-['Geist_Mono',monospace] text-[12px] text-black hover:border-black transition-colors"
                                        >
                                            Accept
                                        </button>
                                        <button
                                            onClick={() =>
                                                handleUpdateStatus("rejected")
                                            }
                                            className="flex-1 border border-[#dbe0ec] py-2.5 font-['Geist_Mono',monospace] text-[12px] text-[#6c6c6c] hover:border-black hover:text-black transition-colors"
                                        >
                                            Decline
                                        </button>
                                    </div>
                                </div>
                            )}

                            {application.status === "interview_scheduled" && (
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() =>
                                                handleUpdateStatus("accepted")
                                            }
                                            className="flex-1 border border-black bg-black py-2.5 font-['Geist_Mono',monospace] text-[12px] text-white hover:bg-zinc-800 transition-colors"
                                        >
                                            Accept
                                        </button>
                                        <button
                                            onClick={() =>
                                                handleUpdateStatus("rejected")
                                            }
                                            className="flex-1 border border-[#dbe0ec] py-2.5 font-['Geist_Mono',monospace] text-[12px] text-[#6c6c6c] hover:border-black hover:text-black transition-colors"
                                        >
                                            Decline
                                        </button>
                                    </div>
                                    <button
                                        onClick={() =>
                                            handleUpdateStatus("under_review")
                                        }
                                        className="w-full border border-[#dbe0ec] py-2.5 font-['Geist_Mono',monospace] text-[12px] text-[#6c6c6c] hover:border-black hover:text-black transition-colors"
                                    >
                                        ← Back to Review
                                    </button>
                                </div>
                            )}

                            {application.status === "accepted" && (
                                <div className="space-y-2">
                                    <div className="border border-black px-4 py-3 text-center">
                                        <p className="font-['Geist_Mono',monospace] text-[12px] text-black">
                                            Accepted
                                        </p>
                                    </div>
                                    <button
                                        onClick={() =>
                                            handleUpdateStatus("under_review")
                                        }
                                        className="w-full border border-[#dbe0ec] py-2.5 font-['Geist_Mono',monospace] text-[12px] text-[#6c6c6c] hover:border-black hover:text-black transition-colors"
                                    >
                                        ← Revert to Review
                                    </button>
                                </div>
                            )}

                            {application.status === "rejected" && (
                                <div className="space-y-2">
                                    <div className="border border-[#dbe0ec] px-4 py-3 text-center">
                                        <p className="font-['Geist_Mono',monospace] text-[12px] text-[#6c6c6c]">
                                            Declined
                                        </p>
                                    </div>
                                    <button
                                        onClick={() =>
                                            handleUpdateStatus("under_review")
                                        }
                                        className="w-full border border-[#dbe0ec] py-2.5 font-['Geist_Mono',monospace] text-[12px] text-[#6c6c6c] hover:border-black hover:text-black transition-colors"
                                    >
                                        ← Reopen for Review
                                    </button>
                                </div>
                            )}

                            {application.status === "draft" && (
                                <div className="border border-[#dbe0ec] px-4 py-3 text-center">
                                    <p className="font-['Geist_Mono',monospace] text-[12px] text-[#6c6c6c]">
                                        Draft — not yet submitted
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Delete Confirmation Modal */}
        {deleteModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="bg-white border border-[#dbe0ec] w-full max-w-sm mx-4">
                    <div className="px-6 py-4 border-b border-[#dbe0ec] flex items-center justify-between">
                        <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.08em]">
                            Delete Application
                        </p>
                        <button
                            onClick={() => setDeleteModalOpen(false)}
                            className="text-[#6c6c6c] hover:text-black transition-colors"
                        >
                            <ArrowLeft className="w-3.5 h-3.5 rotate-[135deg]" />
                        </button>
                    </div>
                    <div className="px-6 py-5 space-y-4">
                        <p className="font-['Source_Serif_4',serif] text-black text-sm leading-relaxed">
                            You are about to permanently delete{" "}
                            <span className="font-medium">{applicantName}</span>'s application. This cannot be undone.
                        </p>
                        <div>
                            <label className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em] block mb-2">
                                Admin Password
                            </label>
                            <input
                                type="password"
                                value={deletePassword}
                                onChange={(e) => {
                                    setDeletePassword(e.target.value);
                                    setDeleteError(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleDeleteApplication();
                                }}
                                placeholder="Enter password to confirm"
                                className="w-full border border-[#dbe0ec] bg-[#f9f9f7] px-4 py-3 font-['Geist_Mono',monospace] text-[12px] text-black placeholder-[#6c6c6c] outline-none focus:border-black transition-colors"
                                autoFocus
                            />
                            {deleteError && (
                                <p className="font-['Geist_Mono',monospace] text-[11px] text-red-600 mt-2">
                                    {deleteError}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="px-6 pb-5 flex gap-3">
                        <button
                            onClick={() => setDeleteModalOpen(false)}
                            disabled={deleting}
                            className="flex-1 border border-[#dbe0ec] py-2.5 font-['Geist_Mono',monospace] text-[12px] text-[#6c6c6c] hover:border-black hover:text-black transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDeleteApplication}
                            disabled={deleting || !deletePassword}
                            className="flex-1 bg-red-600 border border-red-600 py-2.5 font-['Geist_Mono',monospace] text-[12px] text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {deleting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <>
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
