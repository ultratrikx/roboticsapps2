import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { ArrowLeft, Loader2, Sparkles, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";
import { useSettings } from "../../lib/hooks";
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
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [allReviews, setAllReviews] = useState<any[]>([]);
    const [updatingPositionId, setUpdatingPositionId] = useState<string | null>(
        null,
    );
    const [aiResults, setAiResults] = useState<any[]>([]);
    const [aiLoading, setAiLoading] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deletePassword, setDeletePassword] = useState("");
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const { settings } = useSettings();
    const aiEnabled =
        settings.ai_analysis_enabled === true ||
        settings.ai_analysis_enabled === "true";

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
                const [profResult, actsResult, respsResult, honsResult, revsResult, aiResult] = await Promise.all([
                    supabase.from("profiles").select("*").eq("id", app.user_id).single(),
                    supabase.from("activities").select("*").eq("user_id", app.user_id).order("sort_order"),
                    supabase.from("responses").select("*, questions(prompt)").eq("application_id", app.id),
                    supabase.from("honors").select("*").eq("user_id", app.user_id).order("sort_order"),
                    supabase.from("reviews").select("*, profiles:reviewer_id(first_name, last_name, email)").eq("application_id", app.id).order("updated_at", { ascending: false }),
                    supabase.from("ai_analysis_results").select("*").eq("application_id", app.id),
                ]);

                setApplicantProfile(profResult.data);
                setActivities(actsResult.data || []);
                setResponses(respsResult.data || []);
                setHonors(honsResult.data || []);
                setAllReviews(revsResult.data || []);
                setAiResults(aiResult.data || []);

                // Set current admin's scores/notes into edit state
                if (adminProfile && revsResult.data) {
                    const myReview = revsResult.data.find(
                        (r: any) => r.reviewer_id === adminProfile.id,
                    );
                    if (myReview) {
                        setScores(myReview.scores || {});
                        setNotes(myReview.notes || "");
                    }
                }
            }
            setLoading(false);
        };
        fetchData();
    }, [id, adminProfile]);

    const handleSaveReview = async () => {
        if (!application || !adminProfile) return;
        setSaving(true);

        // Check if review exists first, then update or insert
        const { data: existingReview } = await supabase
            .from("reviews")
            .select("id")
            .eq("application_id", application.id)
            .eq("reviewer_id", adminProfile.id)
            .single();

        setError(null);
        setSaveSuccess(false);

        if (existingReview) {
            const { error: err } = await supabase
                .from("reviews")
                .update({ scores, notes, updated_at: new Date().toISOString() })
                .eq("id", existingReview.id);
            if (err) {
                console.error("Failed to update review:", err);
                setError(`Failed to save review: ${err.message}`);
            } else {
                setSaveSuccess(true);
            }
        } else {
            const { error: err } = await supabase.from("reviews").insert({
                application_id: application.id,
                reviewer_id: adminProfile.id,
                scores,
                notes,
                updated_at: new Date().toISOString(),
            });
            if (err) {
                console.error("Failed to insert review:", err);
                setError(`Failed to save review: ${err.message}`);
            } else {
                setSaveSuccess(true);
            }
        }

        // Refetch all reviews so the list stays current
        const { data: allRevs } = await supabase
            .from("reviews")
            .select("*, profiles:reviewer_id(first_name, last_name, email)")
            .eq("application_id", application.id)
            .order("updated_at", { ascending: false });
        setAllReviews(allRevs || []);

        setSaving(false);
    };

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

                        {/* AI Analysis */}
                        {aiEnabled && (
                            <section className="bg-white border border-[#dbe0ec]">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-[#dbe0ec]">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="w-3.5 h-3.5 text-[#6c6c6c]" />
                                        <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em]">
                                            AI Analysis
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {aiResults.length > 0 && (() => {
                                            const avg = aiResults.reduce((s, r) => s + r.similarity_score, 0) / aiResults.length;
                                            return (
                                                <span className={cn(
                                                    "font-['Geist_Mono',monospace] text-[11px] font-medium",
                                                    avg >= 0.8 ? "text-red-600" : avg >= 0.6 ? "text-orange-500" : avg >= 0.4 ? "text-amber-500" : "text-black"
                                                )}>
                                                    Avg: {(avg * 100).toFixed(0)}%
                                                </span>
                                            );
                                        })()}
                                        <button
                                            onClick={async () => {
                                                setAiLoading(true);
                                                try {
                                                    const { data, error } = await supabase.functions.invoke("ai-analysis", {
                                                        body: { applicationId: application.id, provider: "gemini" },
                                                    });
                                                    if (error) throw error;
                                                    if (data?.error) throw new Error(data.error);
                                                    const { data: updated } = await supabase
                                                        .from("ai_analysis_results")
                                                        .select("*")
                                                        .eq("application_id", application.id);
                                                    setAiResults(updated || []);
                                                    toast.success("AI analysis complete");
                                                } catch (e: any) {
                                                    toast.error(`Analysis failed: ${e.message}`);
                                                }
                                                setAiLoading(false);
                                            }}
                                            disabled={aiLoading}
                                            className="flex items-center gap-1.5 px-2.5 py-1 border border-[#dbe0ec] hover:border-black transition-colors disabled:opacity-50"
                                        >
                                            {aiLoading ? (
                                                <Loader2 className="w-3 h-3 animate-spin text-[#6c6c6c]" />
                                            ) : (
                                                <RotateCw className="w-3 h-3 text-[#6c6c6c]" />
                                            )}
                                            <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                                {aiResults.length > 0 ? "Re-run" : "Run Analysis"}
                                            </span>
                                        </button>
                                        <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                            006
                                        </span>
                                    </div>
                                </div>

                                {aiResults.length === 0 && !aiLoading ? (
                                    <div className="px-6 py-8 text-center">
                                        <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm">
                                            No analysis results yet. Click "Run Analysis" to generate AI comparisons.
                                        </p>
                                    </div>
                                ) : aiLoading && aiResults.length === 0 ? (
                                    <div className="px-6 py-8 flex items-center justify-center gap-3">
                                        <Loader2 className="w-4 h-4 animate-spin text-[#6c6c6c]" />
                                        <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm">
                                            Generating AI responses and computing similarity...
                                        </p>
                                    </div>
                                ) : (
                                    responses.map((resp, i) => {
                                        const aiResult = aiResults.find((r) => r.question_id === resp.question_id);
                                        if (!aiResult) return null;
                                        const score = aiResult.similarity_score;
                                        return (
                                            <div
                                                key={`ai-${resp.id}`}
                                                className={cn(
                                                    "px-6 py-5",
                                                    i !== 0 && "border-t border-[#dbe0ec]",
                                                )}
                                            >
                                                <div className="flex items-center justify-between mb-3">
                                                    <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                                        {resp.questions?.prompt || "Question"}
                                                    </p>
                                                    <span className={cn(
                                                        "font-['Geist_Mono',monospace] text-[11px] font-medium",
                                                        score >= 0.8 ? "text-red-600" : score >= 0.6 ? "text-orange-500" : score >= 0.4 ? "text-amber-500" : "text-black"
                                                    )}>
                                                        {(score * 100).toFixed(0)}% similar
                                                    </span>
                                                </div>
                                                {/* Similarity bar */}
                                                <div className="h-1 bg-[#dbe0ec] mb-4">
                                                    <div
                                                        className={cn(
                                                            "h-1 transition-all",
                                                            score >= 0.8 ? "bg-red-600" : score >= 0.6 ? "bg-orange-500" : score >= 0.4 ? "bg-amber-500" : "bg-black"
                                                        )}
                                                        style={{ width: `${score * 100}%` }}
                                                    />
                                                </div>
                                                {/* Side-by-side comparison */}
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em] mb-2">
                                                            Applicant Response
                                                        </p>
                                                        <p className="font-['Source_Serif_4',serif] text-black text-sm leading-[1.6] tracking-[-0.2px] bg-[#f9f9f7] border border-[#dbe0ec] px-4 py-3 whitespace-pre-wrap">
                                                            {resp.content || "(No response)"}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em] mb-2">
                                                            AI-Generated Response
                                                        </p>
                                                        <p className="font-['Source_Serif_4',serif] text-black text-sm leading-[1.6] tracking-[-0.2px] bg-white border border-[#dbe0ec] px-4 py-3 whitespace-pre-wrap">
                                                            {aiResult.generated_response}
                                                        </p>
                                                    </div>
                                                </div>
                                                {/* Meta */}
                                                <p className="font-['Geist_Mono',monospace] text-[9px] text-[#6c6c6c] mt-2">
                                                    {aiResult.provider}/{aiResult.model} · {new Date(aiResult.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                                                </p>
                                            </div>
                                        );
                                    })
                                )}
                            </section>
                        )}
                    </div>
                </div>

                {/* Right pane: Rubric */}
                <div className="w-72 bg-white border-l border-[#dbe0ec] flex flex-col shrink-0">
                    <div className="px-5 py-4 border-b border-[#dbe0ec]">
                        <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em]">
                            Reviewer Rubric
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                        {error && (
                            <div className="border border-red-300 bg-red-50 px-4 py-3">
                                <p className="font-['Geist_Mono',monospace] text-[11px] text-red-700">
                                    {error}
                                </p>
                            </div>
                        )}
                        {saveSuccess && (
                            <div className="border border-[#dbe0ec] bg-[#f9f9f7] px-4 py-3">
                                <p className="font-['Geist_Mono',monospace] text-[11px] text-black">
                                    Evaluation saved.
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

                        {RUBRIC.map((criterion) => (
                            <div key={criterion.id}>
                                <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm mb-3">
                                    {criterion.label}
                                </p>
                                <div className="flex gap-1.5">
                                    {[1, 2, 3, 4, 5].map((score) => (
                                        <button
                                            key={score}
                                            onClick={() =>
                                                setScores({
                                                    ...scores,
                                                    [criterion.id]: score,
                                                })
                                            }
                                            className={cn(
                                                "w-9 h-9 border font-['Geist_Mono',monospace] text-sm transition-colors",
                                                scores[criterion.id] === score
                                                    ? "bg-black border-black text-white"
                                                    : "border-[#dbe0ec] text-[#6c6c6c] hover:border-black hover:text-black",
                                            )}
                                        >
                                            {score}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}

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

                        {Object.keys(scores).length > 0 && (
                            <div className="border border-[#dbe0ec] px-4 py-3">
                                <div className="flex justify-between">
                                    <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em]">
                                        Avg Score
                                    </span>
                                    <span className="font-['Geist_Mono',monospace] text-sm text-black font-medium">
                                        {(
                                            Object.values(scores).reduce(
                                                (a, b) => a + b,
                                                0,
                                            ) / Object.keys(scores).length
                                        ).toFixed(1)}
                                        <span className="text-[#6c6c6c] text-[10px]">
                                            {" "}
                                            / 5.0
                                        </span>
                                    </span>
                                </div>
                            </div>
                        )}

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
                        <button
                            onClick={handleSaveReview}
                            disabled={saving}
                            className="w-full bg-black flex gap-[10px] items-center justify-center px-5 py-3.5 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                        >
                            {saving ? (
                                <Loader2 className="w-4 h-4 text-white animate-spin" />
                            ) : (
                                <>
                                    <div className="bg-white shrink-0 w-[5px] h-[5px]" />
                                    <span className="font-['Geist_Mono',monospace] text-[13px] text-white whitespace-nowrap leading-none">
                                        Save Evaluation
                                    </span>
                                </>
                            )}
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
