import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import {
    Loader2,
    CheckCircle2,
    AlertCircle,
    ArrowRight,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../lib/AuthContext";
import { useApplication, useQuestions } from "../../lib/hooks";
import { supabase } from "../../lib/supabase";
import { cn, formatList } from "../../lib/utils";
import { genericNotificationEmail } from "../../lib/email-templates";

export function ApplicantReview() {
    const { profile } = useAuth();
    const {
        application,
        loading: appsLoading,
        refetch: refetchApps,
    } = useApplication(profile?.id);
    const { questions, loading: qLoading } = useQuestions();
    const navigate = useNavigate();

    const [responses, setResponses] = useState<Record<string, string>>({});
    const [activities, setActivities] = useState<any[]>([]);
    const [honors, setHonors] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [expandedPositions, setExpandedPositions] = useState<Set<string>>(
        new Set(),
    );
    const [submitted, setSubmitted] = useState(false);

    const applicationPositions = application?.application_positions || [];

    const generalQuestions = questions.filter((q: any) => !q.position_id);
    const positionQuestionMap: Record<string, any[]> = {};
    for (const q of questions) {
        if (q.position_id) {
            if (!positionQuestionMap[q.position_id])
                positionQuestionMap[q.position_id] = [];
            positionQuestionMap[q.position_id].push(q);
        }
    }

    useEffect(() => {
        if (appsLoading || qLoading || !profile) return;
        const load = async () => {
            if (application) {
                const { data: respData } = await supabase
                    .from("responses")
                    .select("application_id, question_id, content")
                    .eq("application_id", application.id);
                const map: Record<string, string> = {};
                (respData || []).forEach((r: any) => {
                    map[`${r.application_id}:${r.question_id}`] = r.content;
                });
                setResponses(map);
            }

            const { data: actData } = await supabase
                .from("activities")
                .select("*")
                .eq("user_id", profile.id)
                .order("sort_order");
            setActivities(actData || []);

            const { data: honData } = await supabase
                .from("honors")
                .select("*")
                .eq("user_id", profile.id)
                .order("sort_order");
            setHonors(honData || []);

            setExpandedPositions(
                new Set(applicationPositions.map((ap: any) => ap.id)),
            );
            setLoading(false);
        };
        load();
    }, [appsLoading, qLoading, profile?.id]);

    const togglePosition = (id: string) => {
        setExpandedPositions((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const countForLimit = (content: string, q: any) => {
        const mode = q.limit_mode === "words" ? "words" : "characters";
        if (mode === "words")
            return content.trim() ? content.trim().split(/\s+/).length : 0;
        return content.length;
    };

    const getCompletionStatus = () => {
        const issues: string[] = [];
        if (!profile?.first_name || !profile?.last_name)
            issues.push("Profile incomplete");

        for (const q of generalQuestions) {
            if (q.is_required) {
                const content = responses[`${application.id}:${q.id}`] || "";
                if (!content.trim())
                    issues.push(`Missing: ${q.prompt.substring(0, 40)}...`);
                if (countForLimit(content, q) > (q.char_limit || 2000))
                    issues.push(`Over limit: ${q.prompt.substring(0, 40)}...`);
            }
        }

        for (const ap of applicationPositions) {
            const posQs = positionQuestionMap[ap.position_id] || [];
            for (const q of posQs) {
                if (q.is_required) {
                    const content =
                        responses[`${application.id}:${q.id}`] || "";
                    if (!content.trim())
                        issues.push(
                            `Missing (${ap.positions?.title}): ${q.prompt.substring(0, 30)}...`,
                        );
                    if (countForLimit(content, q) > (q.char_limit || 2000))
                        issues.push(
                            `Over limit (${ap.positions?.title}): ${q.prompt.substring(0, 30)}...`,
                        );
                }
            }
        }

        return issues;
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        const { error } = await supabase
            .from("applications")
            .update({
                status: "submitted",
                submitted_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("id", application.id);

        if (error) {
            toast.error(`Failed to submit: ${error.message}`);
        } else {
            setSubmitted(true);
            toast.success(
                `Application submitted! Great work, ${profile?.first_name}.`,
            );
            await refetchApps();

            // Send submission confirmation email
            const positionNames = formatList(
                applicationPositions
                    .map((ap: any) => ap.positions?.title)
                    .filter(Boolean),
            );
            const portalUrl = window.location.origin + "/applicant";
            const html = genericNotificationEmail(
                profile?.first_name || "Applicant",
                "Application Received",
                `Thank you for submitting your application for ${positionNames || "Executive Position"}. We have received your application and will review it shortly.\n\nYou will be notified of any updates to your application status. In the meantime, you can view your submitted application in the portal.`,
                portalUrl,
            );
            supabase.functions
                .invoke("send-email", {
                    body: {
                        to: profile?.email,
                        subject: `Application Received — WOSS Robotics Executive Applications`,
                        html,
                    },
                })
                .catch(console.error);
        }
        setSubmitting(false);
    };

    if (loading || appsLoading || qLoading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="w-6 h-6 animate-spin text-[#6c6c6c]" />
            </div>
        );
    }

    if (!application) {
        return (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <header className="border-b border-[#dbe0ec] pb-8">
                    <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.1em] mb-3">
                        Step 07
                    </p>
                    <h1
                        className="font-['Source_Serif_4',serif] text-[48px] text-black tracking-[-1.5px]"
                        style={{ lineHeight: 1.05 }}
                    >
                        Review &<br />
                        Submit
                    </h1>
                    <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-lg tracking-[-0.3px] mt-2">
                        You haven't started any applications yet.
                    </p>
                </header>
                <button
                    onClick={() => navigate("/applicant/positions")}
                    className="bg-black flex gap-[10px] items-center justify-center px-5 py-3.5 hover:bg-zinc-800 transition-colors"
                >
                    <div className="bg-white shrink-0 w-[5px] h-[5px]" />
                    <span className="font-['Geist_Mono',monospace] text-[13px] text-white whitespace-nowrap leading-none">
                        Browse Positions
                    </span>
                </button>
            </div>
        );
    }

    if (applicationPositions.length === 0) {
        return (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <header className="border-b border-[#dbe0ec] pb-8">
                    <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.1em] mb-3">
                        Step 07
                    </p>
                    <h1
                        className="font-['Source_Serif_4',serif] text-[48px] text-black tracking-[-1.5px]"
                        style={{ lineHeight: 1.05 }}
                    >
                        Review &<br />
                        Submit
                    </h1>
                    <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-lg tracking-[-0.3px] mt-2">
                        You haven't selected any positions yet. Browse available
                        positions to get started.
                    </p>
                </header>
                <button
                    onClick={() => navigate("/applicant/positions")}
                    className="bg-black flex gap-[10px] items-center justify-center px-5 py-3.5 hover:bg-zinc-800 transition-colors"
                >
                    <div className="bg-white shrink-0 w-[5px] h-[5px]" />
                    <span className="font-['Geist_Mono',monospace] text-[13px] text-white whitespace-nowrap leading-none">
                        Browse Positions
                    </span>
                </button>
            </div>
        );
    }

    const isAlreadySubmitted = application.status !== "draft" || submitted;
    const issues = getCompletionStatus();

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
            <header className="border-b border-[#dbe0ec] pb-8">
                <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.1em] mb-3">
                    Step 07
                </p>
                <h1
                    className="font-['Source_Serif_4',serif] text-[48px] text-black tracking-[-1.5px]"
                    style={{ lineHeight: 1.05 }}
                >
                    Review &<br />
                    Submit
                </h1>
                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-lg tracking-[-0.3px] mt-2">
                    Review your application details below, then submit when
                    ready.
                </p>
            </header>

            {/* Shared info */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                        Shared Information
                    </h2>
                    <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                        Applies to all positions
                    </span>
                </div>

                <div className="border border-[#dbe0ec]">
                    <div className="px-6 py-5 border-b border-[#dbe0ec]">
                        <div className="flex items-center gap-3 mb-3">
                            <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                01
                            </span>
                            <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                Profile
                            </p>
                            {profile?.first_name && profile?.last_name ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-black ml-auto" />
                            ) : (
                                <AlertCircle className="w-3.5 h-3.5 text-[#6c6c6c] ml-auto" />
                            )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 ml-8">
                            {[
                                {
                                    label: "Name",
                                    value: `${profile?.first_name || "\u2014"} ${profile?.last_name || ""}`.trim(),
                                },
                                {
                                    label: "Email",
                                    value: profile?.email || "\u2014",
                                },
                                {
                                    label: "Grade",
                                    value: profile?.grade || "\u2014",
                                },
                            ].map((item) => (
                                <div key={item.label}>
                                    <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em] mb-1">
                                        {item.label}
                                    </p>
                                    <p className="font-['Radio_Canada_Big',sans-serif] text-sm text-black">
                                        {item.value || "\u2014"}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="px-6 py-5 border-b border-[#dbe0ec]">
                        <div className="flex items-center gap-3 mb-3">
                            <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                02
                            </span>
                            <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                Activities
                            </p>
                            <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] ml-auto">
                                {activities.length} added
                            </span>
                        </div>
                        {activities.length > 0 ? (
                            <div className="ml-8 space-y-2">
                                {activities.map((a: any) => (
                                    <div
                                        key={a.id}
                                        className="flex items-center justify-between py-2 border-b border-[#dbe0ec] last:border-0"
                                    >
                                        <div>
                                            <p className="font-['Radio_Canada_Big',sans-serif] text-sm text-black">
                                                {a.role ||
                                                    a.organization ||
                                                    "Activity"}
                                            </p>
                                            <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-xs mt-0.5">
                                                {a.organization}
                                                {a.type
                                                    ? ` \u00b7 ${a.type}`
                                                    : ""}
                                            </p>
                                        </div>
                                        <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                            {a.hours_per_week || 0}h/wk
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm ml-8">
                                No activities added yet.
                            </p>
                        )}
                    </div>

                    <div className="px-6 py-5">
                        <div className="flex items-center gap-3 mb-3">
                            <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                03
                            </span>
                            <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                Honors & Awards
                            </p>
                            <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] ml-auto">
                                {honors.length} added
                            </span>
                        </div>
                        {honors.length > 0 ? (
                            <div className="ml-8 space-y-2">
                                {honors.map((h: any) => (
                                    <div
                                        key={h.id}
                                        className="flex items-center justify-between py-2 border-b border-[#dbe0ec] last:border-0"
                                    >
                                        <p className="font-['Radio_Canada_Big',sans-serif] text-sm text-black">
                                            {h.title}
                                        </p>
                                        <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                            {h.recognition_level} \u00b7{" "}
                                            {h.grade_level}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm ml-8">
                                No honors added yet.
                            </p>
                        )}
                    </div>
                </div>
            </section>

            {/* General Questions */}
            {generalQuestions.length > 0 && (
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                            General Responses
                        </h2>
                        <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                            {generalQuestions.length} question
                            {generalQuestions.length !== 1 ? "s" : ""}
                        </span>
                    </div>
                    <div className="border border-[#dbe0ec]">
                        {generalQuestions.map((q: any, idx: number) => {
                            const content =
                                responses[`${application.id}:${q.id}`] || "";
                            return (
                                <div
                                    key={q.id}
                                    className={cn(
                                        "px-6 py-4",
                                        idx !== 0 &&
                                            "border-t border-[#dbe0ec]",
                                    )}
                                >
                                    <p className="font-['Radio_Canada_Big',sans-serif] text-sm text-black mb-1">
                                        {q.prompt}
                                    </p>
                                    <p
                                        className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm leading-relaxed"
                                        style={{ whiteSpace: "pre-wrap" }}
                                    >
                                        {content || (
                                            <span className="italic">
                                                No response yet
                                            </span>
                                        )}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Per-Position Sections */}
            {applicationPositions.map((ap: any, apIdx: number) => {
                const isExpanded = expandedPositions.has(ap.id);
                const posQuestions = positionQuestionMap[ap.position_id] || [];

                return (
                    <motion.section
                        key={ap.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: apIdx * 0.1 }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                    {String(apIdx + 1).padStart(2, "0")}
                                </span>
                                <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                                    {ap.positions?.title}
                                </h2>
                            </div>
                            <button
                                onClick={() => togglePosition(ap.id)}
                                className="text-[#6c6c6c] hover:text-black transition-colors"
                            >
                                {isExpanded ? (
                                    <ChevronUp className="w-4 h-4" />
                                ) : (
                                    <ChevronDown className="w-4 h-4" />
                                )}
                            </button>
                        </div>

                        {isExpanded && (
                            <div className="border border-[#dbe0ec]">
                                {posQuestions.length > 0 ? (
                                    <div>
                                        <div className="px-6 py-4 bg-[#f9f9f7] border-b border-[#dbe0ec]">
                                            <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em]">
                                                {ap.positions?.title} — Specific
                                                Questions
                                            </p>
                                        </div>
                                        {posQuestions.map(
                                            (q: any, idx: number) => {
                                                const content =
                                                    responses[
                                                        `${application.id}:${q.id}`
                                                    ] || "";
                                                return (
                                                    <div
                                                        key={q.id}
                                                        className={cn(
                                                            "px-6 py-4",
                                                            idx !== 0 &&
                                                                "border-t border-[#dbe0ec]",
                                                        )}
                                                    >
                                                        <p className="font-['Radio_Canada_Big',sans-serif] text-sm text-black mb-1">
                                                            {q.prompt}
                                                        </p>
                                                        <p
                                                            className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm leading-relaxed"
                                                            style={{
                                                                whiteSpace:
                                                                    "pre-wrap",
                                                            }}
                                                        >
                                                            {content || (
                                                                <span className="italic">
                                                                    No response
                                                                    yet
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>
                                                );
                                            },
                                        )}
                                    </div>
                                ) : (
                                    <div className="px-6 py-8 text-center">
                                        <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm">
                                            No position-specific questions for
                                            this role.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.section>
                );
            })}

            {/* Submit Section */}
            <section className="border border-[#dbe0ec]">
                <div className="px-6 py-5 bg-[#f9f9f7]">
                    {isAlreadySubmitted ? (
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 text-black" />
                            <div>
                                <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                    Application Submitted
                                </p>
                                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm mt-0.5">
                                    {application.submitted_at
                                        ? `Submitted on ${new Date(application.submitted_at).toLocaleDateString()}`
                                        : "Your application has been submitted."}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {issues.length > 0 && (
                                <div className="mb-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <AlertCircle className="w-4 h-4 text-[#6c6c6c]" />
                                        <p className="font-['Radio_Canada_Big',sans-serif] text-sm text-[#6c6c6c]">
                                            {issues.length} issue
                                            {issues.length !== 1 ? "s" : ""} to
                                            resolve
                                        </p>
                                    </div>
                                    <ul className="ml-6 space-y-1">
                                        {issues.slice(0, 5).map((issue, i) => (
                                            <li
                                                key={i}
                                                className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-xs"
                                            >
                                                {issue}
                                            </li>
                                        ))}
                                        {issues.length > 5 && (
                                            <li className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                                + {issues.length - 5} more
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            )}
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="bg-black flex gap-[10px] items-center justify-center px-6 py-4 hover:bg-zinc-800 transition-colors disabled:opacity-50 w-full"
                            >
                                {submitting ? (
                                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                                ) : (
                                    <>
                                        <div className="bg-white shrink-0 w-[5px] h-[5px]" />
                                        <span className="font-['Geist_Mono',monospace] text-[13px] text-white whitespace-nowrap leading-none">
                                            Submit Application —{" "}
                                            {applicationPositions.length}{" "}
                                            Position
                                            {applicationPositions.length !== 1
                                                ? "s"
                                                : ""}
                                        </span>
                                    </>
                                )}
                            </button>
                            {issues.length > 0 && (
                                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-xs mt-2 text-center">
                                    You can still submit with incomplete fields,
                                    but we recommend completing everything
                                    first.
                                </p>
                            )}
                        </>
                    )}
                </div>
            </section>

            {/* Edit links */}
            <section className="border-t border-[#dbe0ec] pt-6">
                <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em] mb-3">
                    Need to make changes?
                </p>
                <div className="flex flex-wrap gap-3">
                    {[
                        { label: "Edit Profile", to: "/applicant/profile" },
                        {
                            label: "Edit Activities",
                            to: "/applicant/activities",
                        },
                        { label: "Edit Responses", to: "/applicant/responses" },
                        { label: "Edit Honors", to: "/applicant/honors" },
                    ].map((link) => (
                        <button
                            key={link.to}
                            onClick={() => navigate(link.to)}
                            className="border border-[#dbe0ec] flex gap-[10px] items-center justify-center px-4 py-2.5 hover:border-black transition-colors"
                        >
                            <span className="font-['Geist_Mono',monospace] text-[12px] text-black whitespace-nowrap leading-none">
                                {link.label}
                            </span>
                            <ArrowRight className="w-3 h-3 text-[#6c6c6c]" />
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}
