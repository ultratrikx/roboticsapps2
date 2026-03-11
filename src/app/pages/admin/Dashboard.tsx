import { useState, useRef, useEffect, DragEvent } from "react";
import { Link } from "react-router";
import { Search, Loader2, Download, X, Plus } from "lucide-react";
import { useAllApplications, usePositions } from "../../lib/hooks";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { STATUS_LABELS } from "../../data";
import {
    genericNotificationEmail,
    acceptanceEmail,
    rejectionEmail,
} from "../../lib/email-templates";

const COLUMNS: { key: string; label: string }[] = [
    { key: "draft", label: "Draft" },
    { key: "submitted", label: "Submitted" },
    { key: "under_review", label: "In Review" },
    { key: "interview_scheduled", label: "Interview" },
    { key: "accepted", label: "Accepted" },
    { key: "rejected", label: "Declined" },
];

/** Build a comma-separated string of position titles from application_positions. */
function getPositionTitles(app: any): string {
    const positions = app.application_positions;
    if (!Array.isArray(positions) || positions.length === 0) return "";
    return positions
        .map((ap: any) => ap.positions?.title)
        .filter(Boolean)
        .join(", ");
}

const POS_STATUS_COLORS: Record<string, string> = {
    accepted: "bg-black text-white border-black",
    interview_scheduled: "bg-[#f5f5f3] text-black border-black",
    rejected: "border-[#dbe0ec] text-[#6c6c6c] line-through",
    pending: "border-[#dbe0ec] text-[#6c6c6c]",
};

/** Interactive position tags — remove or re-add positions from an application */
function PositionTags({
    app,
    allPositions,
    onUpdate,
}: {
    app: any;
    allPositions: any[];
    onUpdate: () => void;
}) {
    const positions: any[] = app.application_positions || [];
    const [showAdd, setShowAdd] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const popRef = useRef<HTMLDivElement>(null);

    // Close popover on outside click
    useEffect(() => {
        if (!showAdd) return;
        const handler = (e: MouseEvent) => {
            if (popRef.current && !popRef.current.contains(e.target as Node))
                setShowAdd(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showAdd]);

    const currentPositionIds = new Set(
        positions.map((ap: any) => ap.position_id),
    );
    const removablePositions = allPositions.filter(
        (p: any) => !currentPositionIds.has(p.id) && p.is_open,
    );

    const handleRemove = async (apId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setBusy(apId);
        await supabase.from("application_positions").delete().eq("id", apId);
        onUpdate();
        setBusy(null);
    };

    const handleAdd = async (positionId: string) => {
        setBusy(positionId);
        await supabase
            .from("application_positions")
            .insert({ application_id: app.id, position_id: positionId });
        onUpdate();
        setBusy(null);
        setShowAdd(false);
    };

    return (
        <div className="flex flex-wrap items-center gap-1 relative">
            {positions.map((ap: any) => (
                <span
                    key={ap.id}
                    className={cn(
                        "font-['Geist_Mono',monospace] text-[10px] border px-1.5 py-0.5 inline-flex items-center gap-1 group/tag",
                        POS_STATUS_COLORS[ap.status] ||
                            POS_STATUS_COLORS.pending,
                    )}
                >
                    {ap.positions?.title || "?"}
                    {busy === ap.id ? (
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                        <button
                            onClick={(e) => handleRemove(ap.id, e)}
                            className="opacity-0 group-hover/tag:opacity-100 transition-opacity hover:text-red-500"
                            title="Remove position"
                        >
                            <X className="w-2.5 h-2.5" />
                        </button>
                    )}
                </span>
            ))}
            {positions.length === 0 && (
                <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                    &mdash;
                </span>
            )}
            {removablePositions.length > 0 && (
                <div ref={popRef} className="relative inline-block">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowAdd(!showAdd);
                        }}
                        className="w-5 h-5 border border-dashed border-[#dbe0ec] flex items-center justify-center hover:border-black transition-colors"
                        title="Add position"
                    >
                        <Plus className="w-3 h-3 text-[#6c6c6c]" />
                    </button>
                    {showAdd && (
                        <div className="absolute top-full left-0 mt-1 bg-white border border-[#dbe0ec] shadow-sm z-30 min-w-[160px]">
                            {removablePositions.map((pos: any) => (
                                <button
                                    key={pos.id}
                                    onClick={() => handleAdd(pos.id)}
                                    disabled={busy === pos.id}
                                    className="w-full text-left px-3 py-2 font-['Geist_Mono',monospace] text-[11px] text-black hover:bg-[#f5f5f3] transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    {busy === pos.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                        <Plus className="w-3 h-3 text-[#6c6c6c]" />
                                    )}
                                    {pos.title}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function AdminDashboard() {
    const { applications, loading, refetch } = useAllApplications();
    const { positions: allPositions } = usePositions();
    const [view, setView] = useState<"table" | "kanban">("table");
    const [searchTerm, setSearchTerm] = useState("");
    const [updating, setUpdating] = useState<string | null>(null);
    const [statusError, setStatusError] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);

    const handleQuickStatus = async (appId: string, newStatus: string) => {
        setUpdating(appId);
        setStatusError(null);
        const { error } = await supabase
            .from("applications")
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq("id", appId);
        if (error) {
            console.error("Failed to update status:", error);
            setStatusError(`Failed to update status: ${error.message}`);
        } else {
            refetch();

            // Send status update email
            const app = applications.find((a: any) => a.id === appId);
            if (app?.profiles?.email) {
                const firstName = app.profiles.first_name || "Applicant";
                const portalUrl = window.location.origin + "/applicant";
                const positionNames =
                    getPositionTitles(app) || "Executive Position";
                let emailHtml: string | null = null;
                let emailSubject = "";

                if (newStatus === "under_review") {
                    emailSubject = "Application Under Review — WOSS Robotics";
                    emailHtml = genericNotificationEmail(
                        firstName,
                        "Application Under Review",
                        `Your application for ${positionNames} is now being reviewed by our team. We will notify you of any updates.\n\nThank you for your patience.`,
                        portalUrl,
                    );
                } else if (newStatus === "interview_scheduled") {
                    emailSubject = `Interview Invitation — ${positionNames}`;
                    emailHtml = genericNotificationEmail(
                        firstName,
                        "You've Been Invited to Interview!",
                        `Congratulations! You have been selected for an interview for ${positionNames}.\n\nPlease use the link below to book your interview slot at a time that works for you. You can also find this link on your applicant portal.\n\nhttps://cal.com/wossrobotics/exec-interview-2026-2027`,
                        portalUrl + "/interview",
                    );
                } else if (newStatus === "accepted") {
                    emailSubject = `Congratulations! — ${positionNames}`;
                    emailHtml = acceptanceEmail(
                        firstName,
                        positionNames,
                        portalUrl + "/decisions",
                    );
                } else if (newStatus === "rejected") {
                    emailSubject = `Application Update — ${positionNames}`;
                    emailHtml = rejectionEmail(
                        firstName,
                        positionNames,
                        portalUrl + "/decisions",
                    );
                }

                if (emailHtml) {
                    supabase.functions
                        .invoke("send-email", {
                            body: {
                                to: app.profiles.email,
                                subject: emailSubject,
                                html: emailHtml,
                            },
                        })
                        .catch(console.error);
                }
            }
        }
        setUpdating(null);
    };

    const filteredApps = applications.filter((app: any) => {
        const name =
            `${app.profiles?.first_name || ""} ${app.profiles?.last_name || ""}`
                .trim()
                .toLowerCase();
        const email = (app.profiles?.email || "").toLowerCase();
        const positionText = getPositionTitles(app).toLowerCase();
        const term = searchTerm.toLowerCase();
        return (
            name.includes(term) ||
            email.includes(term) ||
            positionText.includes(term)
        );
    });

    // Group filtered apps by status
    const appsByStatus: Record<string, any[]> = {};
    for (const col of COLUMNS) {
        appsByStatus[col.key] = filteredApps.filter(
            (app: any) => app.status === col.key,
        );
    }

    // Drag handlers
    const onDragStart = (
        e: DragEvent<HTMLDivElement>,
        appId: string,
        currentStatus: string,
    ) => {
        e.dataTransfer.setData("appId", appId);
        e.dataTransfer.setData("currentStatus", currentStatus);
        e.dataTransfer.effectAllowed = "move";
        setDraggingId(appId);
    };

    const onDragEnd = () => {
        setDraggingId(null);
        setDragOverColumn(null);
    };

    const onDragOver = (e: DragEvent<HTMLDivElement>, columnKey: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOverColumn(columnKey);
    };

    const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
        // Only clear if leaving the column element itself
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverColumn(null);
        }
    };

    const onDrop = (e: DragEvent<HTMLDivElement>, targetStatus: string) => {
        e.preventDefault();
        setDragOverColumn(null);
        setDraggingId(null);
        const appId = e.dataTransfer.getData("appId");
        const currentStatus = e.dataTransfer.getData("currentStatus");
        if (appId && currentStatus !== targetStatus) {
            handleQuickStatus(appId, targetStatus);
        }
    };

    const handleExportCSV = async () => {
        setExporting(true);
        try {
            // Fetch full data for all (filtered) applications
            const appIds = filteredApps.map((a: any) => a.id);
            const userIds = filteredApps
                .map((a: any) => a.user_id)
                .filter(Boolean);

            if (appIds.length === 0) return;

            // Fetch activities, responses with questions, and honors for all users
            const [activitiesRes, responsesRes, honorsRes, questionsRes] =
                await Promise.all([
                    supabase
                        .from("activities")
                        .select("*")
                        .in("user_id", userIds)
                        .order("sort_order"),
                    supabase
                        .from("responses")
                        .select("*, questions(prompt, position_id)")
                        .in("application_id", appIds),
                    supabase
                        .from("honors")
                        .select("*")
                        .in("user_id", userIds)
                        .order("sort_order"),
                    supabase
                        .from("questions")
                        .select("*")
                        .eq("is_active", true)
                        .order("sort_order"),
                ]);

            const activitiesByUser: Record<string, any[]> = {};
            (activitiesRes.data || []).forEach((a: any) => {
                if (!activitiesByUser[a.user_id])
                    activitiesByUser[a.user_id] = [];
                activitiesByUser[a.user_id].push(a);
            });

            const responsesByApp: Record<string, any[]> = {};
            (responsesRes.data || []).forEach((r: any) => {
                if (!responsesByApp[r.application_id])
                    responsesByApp[r.application_id] = [];
                responsesByApp[r.application_id].push(r);
            });

            const honorsByUser: Record<string, any[]> = {};
            (honorsRes.data || []).forEach((h: any) => {
                if (!honorsByUser[h.user_id]) honorsByUser[h.user_id] = [];
                honorsByUser[h.user_id].push(h);
            });

            // Get all question prompts for headers
            const allQuestions = questionsRes.data || [];
            const generalQuestions = allQuestions.filter(
                (q: any) => !q.position_id,
            );
            const positionQuestions = allQuestions.filter(
                (q: any) => q.position_id,
            );

            // Determine max counts for dynamic columns
            const maxActivities = Math.max(
                1,
                ...Object.values(activitiesByUser).map((a) => a.length),
            );
            const maxHonors = Math.max(
                1,
                ...Object.values(honorsByUser).map((h) => h.length),
            );

            // Build headers
            const headers: string[] = [
                "Name",
                "Email",
                "Grade",
                "Positions",
                "Status",
                "Submitted Date",
            ];

            // Activity columns
            for (let i = 1; i <= maxActivities; i++) {
                headers.push(
                    `Activity ${i} Type`,
                    `Activity ${i} Role`,
                    `Activity ${i} Organization`,
                    `Activity ${i} Description`,
                    `Activity ${i} Hours/Week`,
                    `Activity ${i} Weeks/Year`,
                );
            }

            // Honor columns
            for (let i = 1; i <= maxHonors; i++) {
                headers.push(
                    `Honor ${i} Title`,
                    `Honor ${i} Grade Level`,
                    `Honor ${i} Recognition Level`,
                );
            }

            // Question columns (general first, then position-specific)
            for (const q of generalQuestions) {
                headers.push(`[General] ${q.prompt.substring(0, 80)}`);
            }
            for (const q of positionQuestions) {
                headers.push(`[Position] ${q.prompt.substring(0, 80)}`);
            }

            // Build rows
            const rows: string[][] = [];
            for (const app of filteredApps) {
                const name =
                    `${app.profiles?.first_name || ""} ${app.profiles?.last_name || ""}`.trim() ||
                    "Unknown";
                const email = app.profiles?.email || "";
                const grade = app.profiles?.grade || "";
                const positions = getPositionTitles(app);
                const status = STATUS_LABELS[app.status] ?? app.status;
                const submitted = app.submitted_at
                    ? new Date(app.submitted_at).toLocaleDateString()
                    : "";

                const row: string[] = [
                    name,
                    email,
                    grade,
                    positions,
                    status,
                    submitted,
                ];

                // Activities
                const userActivities = activitiesByUser[app.user_id] || [];
                for (let i = 0; i < maxActivities; i++) {
                    const a = userActivities[i];
                    row.push(
                        a?.type || "",
                        a?.role || "",
                        a?.organization || "",
                        a?.description || "",
                        String(a?.hours_per_week || ""),
                        String(a?.weeks_per_year || ""),
                    );
                }

                // Honors
                const userHonors = honorsByUser[app.user_id] || [];
                for (let i = 0; i < maxHonors; i++) {
                    const h = userHonors[i];
                    row.push(
                        h?.title || "",
                        h?.grade_level || "",
                        h?.recognition_level || "",
                    );
                }

                // Responses (match by question ID)
                const appResponses = responsesByApp[app.id] || [];
                const responseMap: Record<string, string> = {};
                appResponses.forEach((r: any) => {
                    responseMap[r.question_id] = r.content || "";
                });

                for (const q of generalQuestions) {
                    row.push(responseMap[q.id] || "");
                }
                for (const q of positionQuestions) {
                    row.push(responseMap[q.id] || "");
                }

                rows.push(row);
            }

            const escape = (val: string) =>
                `"${String(val).replace(/"/g, '""').replace(/\n/g, " ")}"`;
            const csv = [
                headers.map(escape).join(","),
                ...rows.map((r) => r.map(escape).join(",")),
            ].join("\n");
            const blob = new Blob(["\ufeff" + csv], {
                type: "text/csv;charset=utf-8;",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `applications-full-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="w-6 h-6 animate-spin text-[#6c6c6c]" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <header className="border-b border-[#dbe0ec] pb-7">
                <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.1em] mb-3">
                    Admin — 01
                </p>
                <div className="flex items-end justify-between">
                    <h1
                        className="font-['Source_Serif_4',serif] text-[40px] text-black tracking-[-1.2px]"
                        style={{ lineHeight: 1.05 }}
                    >
                        Application
                        <br />
                        Review
                    </h1>
                    <div className="flex items-center gap-4 mb-1">
                        <div className="flex border border-[#dbe0ec]">
                            <button
                                className={cn(
                                    "px-3 py-1.5 font-['Geist_Mono',monospace] text-[11px]",
                                    view === "table"
                                        ? "bg-black text-white"
                                        : "text-[#6c6c6c] hover:text-black",
                                )}
                                onClick={() => setView("table")}
                            >
                                Table
                            </button>
                            <button
                                className={cn(
                                    "px-3 py-1.5 font-['Geist_Mono',monospace] text-[11px]",
                                    view === "kanban"
                                        ? "bg-black text-white"
                                        : "text-[#6c6c6c] hover:text-black",
                                )}
                                onClick={() => setView("kanban")}
                            >
                                Board
                            </button>
                        </div>
                        <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] border border-[#dbe0ec] px-2.5 py-1">
                            {applications.length} total
                        </span>
                    </div>
                </div>
            </header>

            {/* Status Error */}
            {statusError && (
                <div className="border border-red-300 bg-red-50 px-5 py-4 flex items-start justify-between gap-4">
                    <p className="font-['Radio_Canada_Big',sans-serif] text-sm text-red-700">
                        {statusError}
                    </p>
                    <button
                        onClick={() => setStatusError(null)}
                        className="font-['Geist_Mono',monospace] text-[11px] text-red-500 hover:text-red-700 shrink-0"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Search Bar + Export */}
            <div className="flex items-center gap-3">
                <div className="relative w-72">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6c6c6c] w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search applicants..."
                        className="w-full border border-[#dbe0ec] bg-white pl-11 pr-4 py-3 font-['Radio_Canada_Big',sans-serif] text-sm text-black placeholder-[#6c6c6c] outline-none focus:border-black transition-colors"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button
                    onClick={handleExportCSV}
                    disabled={exporting}
                    className="flex items-center gap-2 border border-[#dbe0ec] px-4 py-3 font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] hover:border-black hover:text-black transition-colors disabled:opacity-50"
                >
                    {exporting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                        <Download className="w-3.5 h-3.5" />
                    )}
                    {exporting ? "Exporting..." : "Export CSV"}
                </button>
            </div>

            {/* Table View */}
            {view === "table" && (
                <div className="border border-[#dbe0ec] overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-[#dbe0ec]">
                                <th className="px-4 py-3 text-left font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em] font-normal">
                                    Name
                                </th>
                                <th className="px-4 py-3 text-left font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em] font-normal">
                                    Email
                                </th>
                                <th className="px-4 py-3 text-left font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em] font-normal">
                                    Positions
                                </th>
                                <th className="px-4 py-3 text-left font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em] font-normal">
                                    Status
                                </th>
                                <th className="px-4 py-3 text-left font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em] font-normal">
                                    Submitted
                                </th>
                                <th className="px-4 py-3 text-left font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em] font-normal">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredApps.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-4 py-12 text-center font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]"
                                    >
                                        {searchTerm
                                            ? "No matching applications"
                                            : "No applications yet"}
                                    </td>
                                </tr>
                            )}
                            {filteredApps.map((app: any) => {
                                const name =
                                    `${app.profiles?.first_name || ""} ${app.profiles?.last_name || ""}`.trim() ||
                                    "Unknown";
                                const positionTitles = getPositionTitles(app);
                                const isUpdating = updating === app.id;

                                return (
                                    <tr
                                        key={app.id}
                                        className="border-b border-[#dbe0ec] hover:bg-[#f9f9f7]"
                                    >
                                        <td className="px-4 py-4">
                                            <Link
                                                to={`/admin/applications/${app.id}`}
                                                className="font-['Radio_Canada_Big',sans-serif] font-medium text-sm text-black hover:underline"
                                            >
                                                {name}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-4 font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                                            {app.profiles?.email || "—"}
                                        </td>
                                        <td className="px-4 py-4">
                                            <PositionTags
                                                app={app}
                                                allPositions={allPositions}
                                                onUpdate={refetch}
                                            />
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className="font-['Geist_Mono',monospace] text-[10px] border border-[#dbe0ec] px-2 py-0.5">
                                                {STATUS_LABELS[app.status] ??
                                                    app.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                                            {app.submitted_at
                                                ? new Date(
                                                      app.submitted_at,
                                                  ).toLocaleDateString()
                                                : "—"}
                                        </td>
                                        <td className="px-4 py-4">
                                            {isUpdating ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6c6c6c]" />
                                            ) : (
                                                <select
                                                    value={app.status}
                                                    onChange={(e) =>
                                                        handleQuickStatus(
                                                            app.id,
                                                            e.target.value,
                                                        )
                                                    }
                                                    className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] border border-[#dbe0ec] bg-white px-2 py-1 outline-none focus:border-black"
                                                >
                                                    {COLUMNS.map((col) => (
                                                        <option
                                                            key={col.key}
                                                            value={col.key}
                                                        >
                                                            {col.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Kanban Board */}
            {view === "kanban" && (
                <div className="flex flex-wrap gap-4 overflow-x-auto pb-4">
                    {COLUMNS.map((col) => {
                        const columnApps = appsByStatus[col.key] || [];
                        const isOver = dragOverColumn === col.key;

                        return (
                            <div
                                key={col.key}
                                className={cn(
                                    "flex-1 min-w-[200px] bg-[#f9f9f7] border border-[#dbe0ec] flex flex-col transition-colors",
                                    isOver && "border-black bg-[#f0f0ee]",
                                )}
                                onDragOver={(e) => onDragOver(e, col.key)}
                                onDragLeave={onDragLeave}
                                onDrop={(e) => onDrop(e, col.key)}
                            >
                                {/* Column Header */}
                                <div className="px-4 py-3 border-b border-[#dbe0ec] flex items-center justify-between">
                                    <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.06em]">
                                        {col.label}
                                    </span>
                                    <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] border border-[#dbe0ec] bg-white px-1.5 py-0.5 min-w-[20px] text-center">
                                        {columnApps.length}
                                    </span>
                                </div>

                                {/* Cards Container */}
                                <div className="p-3 space-y-3 overflow-y-auto min-h-[200px] max-h-[calc(100vh-320px)]">
                                    {columnApps.map((app: any) => {
                                        const name =
                                            `${app.profiles?.first_name || ""} ${app.profiles?.last_name || ""}`.trim() ||
                                            app.profiles?.email ||
                                            "Unknown";
                                        const positionTitles =
                                            getPositionTitles(app);
                                        const isDragging =
                                            draggingId === app.id;
                                        const isUpdating = updating === app.id;

                                        return (
                                            <div
                                                key={app.id}
                                                draggable={!isUpdating}
                                                onDragStart={(e) =>
                                                    onDragStart(
                                                        e,
                                                        app.id,
                                                        app.status,
                                                    )
                                                }
                                                onDragEnd={onDragEnd}
                                                className={cn(
                                                    "bg-white border border-[#dbe0ec] p-4 cursor-grab active:cursor-grabbing group transition-opacity",
                                                    isDragging && "opacity-40",
                                                    isUpdating &&
                                                        "opacity-50 pointer-events-none",
                                                )}
                                            >
                                                {isUpdating && (
                                                    <div className="flex items-center justify-center py-2">
                                                        <Loader2 className="w-4 h-4 animate-spin text-[#6c6c6c]" />
                                                    </div>
                                                )}
                                                <div
                                                    className={cn(
                                                        isUpdating &&
                                                            "invisible",
                                                    )}
                                                >
                                                    <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm leading-tight">
                                                        {name}
                                                    </p>
                                                    <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] mt-1">
                                                        {app.profiles?.email}
                                                    </p>
                                                    <div className="mt-2">
                                                        <PositionTags
                                                            app={app}
                                                            allPositions={
                                                                allPositions
                                                            }
                                                            onUpdate={refetch}
                                                        />
                                                    </div>
                                                    <p className="font-['Geist_Mono',monospace] text-[9px] text-[#6c6c6c] mt-2">
                                                        {app.submitted_at
                                                            ? new Date(
                                                                  app.submitted_at,
                                                              ).toLocaleDateString()
                                                            : "---"}
                                                    </p>
                                                    <Link
                                                        to={`/admin/applications/${app.id}`}
                                                        className="font-['Geist_Mono',monospace] text-[11px] text-black opacity-0 group-hover:opacity-100 transition-opacity hover:underline mt-2 inline-block"
                                                    >
                                                        Review &rarr;
                                                    </Link>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {columnApps.length === 0 && (
                                        <div className="flex items-center justify-center h-24">
                                            <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                                {searchTerm
                                                    ? "No matches"
                                                    : "Empty"}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
