import { useState, useEffect, useRef, DragEvent } from "react";
import { Link } from "react-router";
import { Loader2, X, RotateCcw, GripVertical, RotateCw } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { usePositions } from "../../lib/hooks";
import { cn } from "../../lib/utils";

const RUBRIC = [
    { id: "experience", label: "Experience" },
    { id: "essay", label: "Essay" },
    { id: "leadership", label: "Leadership" },
    { id: "fit", label: "Fit" },
];

function avgOf(s: Record<string, number>): number | null {
    const vals = Object.values(s).filter((v) => typeof v === "number");
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function isAcceptedApp(item: any): boolean {
    return item.ap.applications?.status === "accepted";
}

function sortByScore(data: any[]): any[] {
    return [...data].sort((a, b) => {
        const aAccepted = isAcceptedApp(a);
        const bAccepted = isAcceptedApp(b);
        if (aAccepted && !bAccepted) return -1;
        if (!aAccepted && bAccepted) return 1;
        if (a.ap.eliminated && !b.ap.eliminated) return 1;
        if (!a.ap.eliminated && b.ap.eliminated) return -1;
        const scoreA = a.positionAvg ?? a.overallAvg ?? -1;
        const scoreB = b.positionAvg ?? b.overallAvg ?? -1;
        return scoreB - scoreA;
    });
}

export function AdminRankings() {
    const { positions, loading: posLoading } = usePositions();
    const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
    const [rankData, setRankData] = useState<any[]>([]);
    const [rankLoading, setRankLoading] = useState(false);
    const [savingNote, setSavingNote] = useState<string | null>(null);
    const [editingNote, setEditingNote] = useState<Record<string, string>>({});
    const [togglingEliminated, setTogglingEliminated] = useState<string | null>(null);
    const [showEliminated, setShowEliminated] = useState(false);
    const [isManualOrder, setIsManualOrder] = useState(false);
    const [savingOrder, setSavingOrder] = useState(false);

    // Drag state
    const dragIndexRef = useRef<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    // Default to first position once loaded
    useEffect(() => {
        if (!selectedPositionId && positions.length > 0) {
            setSelectedPositionId(positions[0].id);
        }
    }, [positions, selectedPositionId]);

    // Reset view state when switching positions
    useEffect(() => {
        setShowEliminated(false);
        setIsManualOrder(false);
    }, [selectedPositionId]);

    // Fetch applicants + scores for selected position
    useEffect(() => {
        if (!selectedPositionId) return;
        setRankLoading(true);

        const fetchRankData = async () => {
            const { data: appPositions } = await supabase
                .from("application_positions")
                .select("*, applications(id, status, user_id, profiles:user_id(first_name, last_name, email))")
                .eq("position_id", selectedPositionId)
                .order("created_at");

            const eligible = (appPositions || []).filter(
                (ap: any) =>
                    ap.applications?.status === "under_review" ||
                    ap.applications?.status === "interview_scheduled" ||
                    ap.applications?.status === "accepted"
            );

            if (eligible.length === 0) {
                setRankData([]);
                setRankLoading(false);
                return;
            }

            const notes: Record<string, string> = {};
            for (const ap of eligible) {
                notes[ap.id] = ap.ranking_note || "";
            }
            setEditingNote(notes);

            const appIds = eligible.map((ap: any) => ap.application_id).filter(Boolean);
            const { data: reviews } = await supabase
                .from("reviews")
                .select("application_id, scores, position_scores")
                .in("application_id", appIds);

            const reviewsByApp: Record<string, any[]> = {};
            for (const r of reviews || []) {
                if (!reviewsByApp[r.application_id]) reviewsByApp[r.application_id] = [];
                reviewsByApp[r.application_id].push(r);
            }

            const computed = eligible.map((ap: any) => {
                const appReviews = reviewsByApp[ap.application_id] || [];

                const posAvgs: number[] = [];
                const overallAvgs: number[] = [];
                for (const rev of appReviews) {
                    const posScore = (rev.position_scores || {})[selectedPositionId];
                    if (posScore && Object.keys(posScore).length > 0) {
                        const a = avgOf(posScore);
                        if (a != null) posAvgs.push(a);
                    }
                    const ovScore = rev.scores || {};
                    if (Object.keys(ovScore).length > 0) {
                        const a = avgOf(ovScore);
                        if (a != null) overallAvgs.push(a);
                    }
                }

                const positionAvg = posAvgs.length > 0
                    ? posAvgs.reduce((a, b) => a + b, 0) / posAvgs.length
                    : null;
                const overallAvg = overallAvgs.length > 0
                    ? overallAvgs.reduce((a, b) => a + b, 0) / overallAvgs.length
                    : null;

                const rubricBreakdown: Record<string, number[]> = {};
                for (const rev of appReviews) {
                    const posScore = (rev.position_scores || {})[selectedPositionId] || {};
                    for (const c of RUBRIC) {
                        if (posScore[c.id] != null) {
                            if (!rubricBreakdown[c.id]) rubricBreakdown[c.id] = [];
                            rubricBreakdown[c.id].push(posScore[c.id]);
                        }
                    }
                }
                const rubricAvg: Record<string, number> = {};
                for (const c of RUBRIC) {
                    const vals = rubricBreakdown[c.id];
                    if (vals && vals.length > 0) {
                        rubricAvg[c.id] = vals.reduce((a, b) => a + b, 0) / vals.length;
                    }
                }

                return { ap, positionAvg, overallAvg, rubricAvg, reviewCount: appReviews.length };
            });

            // If any manual rank_order has been set, use that order; otherwise sort by score
            const hasManualOrder = eligible.some((ap: any) => ap.rank_order != null);
            if (hasManualOrder) {
                computed.sort((a, b) => {
                    const aAccepted = isAcceptedApp(a);
                    const bAccepted = isAcceptedApp(b);
                    if (aAccepted && !bAccepted) return -1;
                    if (!aAccepted && bAccepted) return 1;
                    if (a.ap.eliminated && !b.ap.eliminated) return 1;
                    if (!a.ap.eliminated && b.ap.eliminated) return -1;
                    return (a.ap.rank_order ?? 9999) - (b.ap.rank_order ?? 9999);
                });
                setIsManualOrder(true);
            } else {
                setIsManualOrder(false);
                computed.sort((a, b) => sortByScore([a, b]).indexOf(a) - sortByScore([a, b]).indexOf(b));
                // Use proper sort
                const sorted = sortByScore(computed);
                setRankData(sorted);
                setRankLoading(false);
                return;
            }

            setRankData(computed);
            setRankLoading(false);
        };

        fetchRankData();
    }, [selectedPositionId]);

    const saveOrder = async (ordered: any[]) => {
        setSavingOrder(true);
        // Accepted items are pinned and don't need a stored rank_order
        const rankableItems = ordered.filter((d) => !d.ap.eliminated && !isAcceptedApp(d));
        const updates = rankableItems.map((item, idx) =>
            supabase
                .from("application_positions")
                .update({ rank_order: idx + 1 })
                .eq("id", item.ap.id)
        );
        await Promise.all(updates);
        setSavingOrder(false);
    };

    const handleResetOrder = async () => {
        const reset = sortByScore(rankData);
        // Null out all rank_order values
        const updates = reset
            .filter((d) => !d.ap.eliminated)
            .map((item) =>
                supabase
                    .from("application_positions")
                    .update({ rank_order: null })
                    .eq("id", item.ap.id)
            );
        await Promise.all(updates);
        setRankData(reset.map((item) => ({ ...item, ap: { ...item.ap, rank_order: null } })));
        setIsManualOrder(false);
    };

    // Drag handlers — only operate on non-eliminated items in the full rankData array
    const onDragStart = (e: DragEvent<HTMLDivElement>, dataIndex: number) => {
        dragIndexRef.current = dataIndex;
        e.dataTransfer.effectAllowed = "move";
    };

    const onDragOver = (e: DragEvent<HTMLDivElement>, dataIndex: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOverIndex(dataIndex);
    };

    const onDrop = (e: DragEvent<HTMLDivElement>, dropIndex: number) => {
        e.preventDefault();
        setDragOverIndex(null);
        const fromIndex = dragIndexRef.current;
        dragIndexRef.current = null;
        if (fromIndex == null || fromIndex === dropIndex) return;

        // Reorder the full rankData (only non-eliminated, non-accepted move)
        const next = [...rankData];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(dropIndex, 0, moved);
        // Re-pin accepted items to top
        const accepted = next.filter((d) => isAcceptedApp(d));
        const rest = next.filter((d) => !isAcceptedApp(d));
        const reordered = [...accepted, ...rest];
        setRankData(reordered);
        setIsManualOrder(true);
        saveOrder(reordered);
    };

    const onDragEnd = () => {
        dragIndexRef.current = null;
        setDragOverIndex(null);
    };

    const handleSaveNote = async (apId: string) => {
        setSavingNote(apId);
        await supabase
            .from("application_positions")
            .update({ ranking_note: editingNote[apId] || null })
            .eq("id", apId);
        setSavingNote(null);
    };

    const handleToggleEliminated = async (apId: string, current: boolean) => {
        setTogglingEliminated(apId);
        const newVal = !current;
        await supabase
            .from("application_positions")
            .update({ eliminated: newVal })
            .eq("id", apId);
        setRankData((prev) => {
            const updated = prev.map((item) =>
                item.ap.id === apId
                    ? { ...item, ap: { ...item.ap, eliminated: newVal } }
                    : item
            );
            // Re-sort: eliminated always sink to bottom, preserve relative order otherwise
            const active = updated.filter((d) => !d.ap.eliminated);
            const elim = updated.filter((d) => d.ap.eliminated);
            return [...active, ...elim];
        });
        setTogglingEliminated(null);
    };

    const selectedPosition = positions.find((p) => p.id === selectedPositionId);
    const activeItems = rankData.filter((d) => !d.ap.eliminated);
    const eliminatedItems = rankData.filter((d) => d.ap.eliminated);
    const visibleData = showEliminated ? rankData : activeItems;

    if (posLoading) {
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
                    Admin — 08
                </p>
                <h1
                    className="font-['Source_Serif_4',serif] text-[40px] text-black tracking-[-1.2px]"
                    style={{ lineHeight: 1.05 }}
                >
                    Position
                    <br />
                    Rankings
                </h1>
                <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] mt-3">
                    Defaults to score order. Drag rows to override. Score changes don't affect manual order.
                </p>
            </header>

            {/* Position Tabs */}
            {positions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {positions.map((pos) => (
                        <button
                            key={pos.id}
                            onClick={() => setSelectedPositionId(pos.id)}
                            className={cn(
                                "px-4 py-2 border font-['Geist_Mono',monospace] text-[11px] transition-colors",
                                selectedPositionId === pos.id
                                    ? "bg-black border-black text-white"
                                    : "border-[#dbe0ec] text-[#6c6c6c] hover:border-black hover:text-black"
                            )}
                        >
                            {pos.title}
                        </button>
                    ))}
                </div>
            )}

            {/* Leaderboard */}
            {selectedPosition && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-lg">
                                {selectedPosition.title}
                            </h2>
                            {isManualOrder && (
                                <span className="font-['Geist_Mono',monospace] text-[10px] border border-[#dbe0ec] px-2 py-0.5 text-[#6c6c6c]">
                                    manual order
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            {isManualOrder && (
                                <button
                                    onClick={handleResetOrder}
                                    disabled={savingOrder}
                                    className="flex items-center gap-1.5 font-['Geist_Mono',monospace] text-[11px] border border-[#dbe0ec] px-3 py-1.5 text-[#6c6c6c] hover:border-black hover:text-black transition-colors disabled:opacity-50"
                                    title="Reset to score order"
                                >
                                    <RotateCw className="w-3 h-3" />
                                    Reset to score order
                                </button>
                            )}
                            {savingOrder && (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6c6c6c]" />
                            )}
                            {eliminatedItems.length > 0 && (
                                <button
                                    onClick={() => setShowEliminated((v) => !v)}
                                    className={cn(
                                        "font-['Geist_Mono',monospace] text-[11px] border px-3 py-1.5 transition-colors",
                                        showEliminated
                                            ? "bg-black border-black text-white"
                                            : "border-[#dbe0ec] text-[#6c6c6c] hover:border-black hover:text-black"
                                    )}
                                >
                                    {showEliminated ? "Hide" : "Show"} eliminated ({eliminatedItems.length})
                                </button>
                            )}
                            <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] border border-[#dbe0ec] px-2.5 py-1">
                                {activeItems.length} active
                            </span>
                        </div>
                    </div>

                    {rankLoading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-5 h-5 animate-spin text-[#6c6c6c]" />
                        </div>
                    ) : rankData.length === 0 ? (
                        <div className="border border-[#dbe0ec] px-6 py-12 text-center">
                            <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                                No applicants in review or interview for this position.
                            </p>
                        </div>
                    ) : (
                        <div className="border border-[#dbe0ec]">
                            {/* Table header */}
                            <div className="grid grid-cols-[1.5rem_2.5rem_1fr_6rem_6rem_1fr_7rem_2.5rem] border-b border-[#dbe0ec] bg-[#f9f9f7]">
                                <div className="px-2 py-3" />
                                <div className="px-4 py-3 font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em]">#</div>
                                <div className="px-4 py-3 font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em]">Applicant</div>
                                <div className="px-4 py-3 font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em]">Pos. Score</div>
                                <div className="px-4 py-3 font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em]">Overall</div>
                                <div className="px-4 py-3 font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em]">Team Note</div>
                                <div className="px-4 py-3 font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em]">Breakdown</div>
                                <div className="px-2 py-3" />
                            </div>

                            {visibleData.map((item, visibleIdx) => {
                                const { ap, positionAvg, overallAvg, rubricAvg, reviewCount } = item;
                                const isEliminated = ap.eliminated === true;
                                const isAccepted = isAcceptedApp(item);
                                // dataIndex in the full rankData array (for drag)
                                const dataIndex = rankData.indexOf(item);
                                const app = ap.applications;
                                const prof = app?.profiles;
                                const name = prof
                                    ? `${prof.first_name || ""} ${prof.last_name || ""}`.trim() || prof.email
                                    : "Unknown";
                                const apId = ap.id;
                                const rank = isEliminated ? null : visibleIdx + 1;
                                const isDragTarget = !isEliminated && !isAccepted && dragOverIndex === dataIndex;
                                const isDraggable = !isEliminated && !isAccepted;

                                return (
                                    <div
                                        key={apId}
                                        draggable={isDraggable}
                                        onDragStart={(e) => isDraggable && onDragStart(e, dataIndex)}
                                        onDragOver={(e) => isDraggable && onDragOver(e, dataIndex)}
                                        onDrop={(e) => isDraggable && onDrop(e, dataIndex)}
                                        onDragEnd={onDragEnd}
                                        className={cn(
                                            "grid grid-cols-[1.5rem_2.5rem_1fr_6rem_6rem_1fr_7rem_2.5rem] border-b border-[#dbe0ec] last:border-b-0 items-start transition-colors",
                                            isEliminated
                                                ? "bg-[#f9f9f7] opacity-50"
                                                : isAccepted
                                                  ? "bg-[#f0fdf4]"
                                                  : isDragTarget
                                                    ? "bg-[#f0f0ee] border-t-2 border-t-black"
                                                    : "hover:bg-[#f9f9f7]",
                                            !isDraggable && "cursor-default"
                                        )}
                                    >
                                        {/* Drag handle */}
                                        <div className={cn(
                                            "px-1 py-4 flex items-start justify-center pt-[18px]",
                                            isDraggable && "cursor-grab active:cursor-grabbing"
                                        )}>
                                            {isDraggable && (
                                                <GripVertical className="w-3.5 h-3.5 text-[#dbe0ec]" />
                                            )}
                                        </div>

                                        {/* Rank */}
                                        <div className="px-4 py-4 font-['Geist_Mono',monospace] text-sm text-black font-medium">
                                            {isEliminated ? (
                                                <span className="text-[#6c6c6c] text-[10px]">–</span>
                                            ) : isAccepted ? (
                                                <span className="text-[10px] text-green-700">★</span>
                                            ) : rank != null && (positionAvg != null || overallAvg != null) ? (
                                                rank
                                            ) : (
                                                "—"
                                            )}
                                        </div>

                                        {/* Name */}
                                        <div className="px-4 py-4">
                                            <Link
                                                to={`/admin/applications/${app?.id}`}
                                                className={cn(
                                                    "font-['Radio_Canada_Big',sans-serif] font-medium text-sm hover:underline block",
                                                    isEliminated ? "text-[#6c6c6c] line-through" : "text-black"
                                                )}
                                            >
                                                {name}
                                            </Link>
                                            <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] mt-0.5">
                                                {prof?.email || ""}
                                            </p>
                                            {isAccepted && (
                                                <span className="inline-block font-['Geist_Mono',monospace] text-[9px] bg-green-700 text-white px-1 py-0.5 mt-1 mr-1">
                                                    accepted
                                                </span>
                                            )}
                                            {ap.position_rank != null && (
                                                <span className="inline-block font-['Geist_Mono',monospace] text-[9px] bg-black text-white px-1 py-0.5 mt-1">
                                                    #{ap.position_rank} choice
                                                </span>
                                            )}
                                        </div>

                                        {/* Position score */}
                                        <div className="px-4 py-4">
                                            {positionAvg != null ? (
                                                <span className="font-['Geist_Mono',monospace] text-sm text-black font-medium">
                                                    {positionAvg.toFixed(1)}
                                                    <span className="text-[#6c6c6c] text-[10px]">/5</span>
                                                </span>
                                            ) : (
                                                <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">—</span>
                                            )}
                                            {reviewCount > 0 && (
                                                <p className="font-['Geist_Mono',monospace] text-[9px] text-[#6c6c6c] mt-0.5">
                                                    {reviewCount} rev.
                                                </p>
                                            )}
                                        </div>

                                        {/* Overall score */}
                                        <div className="px-4 py-4">
                                            {overallAvg != null ? (
                                                <span className="font-['Geist_Mono',monospace] text-sm text-[#6c6c6c]">
                                                    {overallAvg.toFixed(1)}
                                                    <span className="text-[10px]">/5</span>
                                                </span>
                                            ) : (
                                                <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">—</span>
                                            )}
                                        </div>

                                        {/* Team Note */}
                                        <div className="px-4 py-3">
                                            <div className="flex items-start gap-2">
                                                <textarea
                                                    className="flex-1 min-h-[56px] border border-[#dbe0ec] bg-white px-2 py-1.5 font-['Source_Serif_4',serif] text-xs text-black leading-relaxed resize-none outline-none focus:border-black transition-colors placeholder-[#6c6c6c] disabled:bg-[#f9f9f7] disabled:text-[#6c6c6c]"
                                                    placeholder="Add a team note..."
                                                    value={editingNote[apId] ?? ""}
                                                    disabled={isEliminated}
                                                    onChange={(e) => setEditingNote({ ...editingNote, [apId]: e.target.value })}
                                                    onBlur={() => !isEliminated && handleSaveNote(apId)}
                                                />
                                                {savingNote === apId && (
                                                    <Loader2 className="w-3 h-3 animate-spin text-[#6c6c6c] mt-2 shrink-0" />
                                                )}
                                            </div>
                                        </div>

                                        {/* Rubric breakdown */}
                                        <div className="px-4 py-4">
                                            <div className="flex flex-wrap gap-1">
                                                {RUBRIC.map((c) =>
                                                    rubricAvg[c.id] != null ? (
                                                        <span
                                                            key={c.id}
                                                            className="font-['Geist_Mono',monospace] text-[9px] border border-[#dbe0ec] text-[#6c6c6c] px-1 py-0.5"
                                                        >
                                                            {c.label.charAt(0)} {rubricAvg[c.id].toFixed(1)}
                                                        </span>
                                                    ) : null
                                                )}
                                                {Object.keys(rubricAvg).length === 0 && (
                                                    <span className="font-['Geist_Mono',monospace] text-[9px] text-[#6c6c6c]">
                                                        No pos. scores
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Eliminate / Restore */}
                                        <div className="px-2 py-4 flex items-start justify-center">
                                            {isAccepted ? null : togglingEliminated === apId ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6c6c6c]" />
                                            ) : isEliminated ? (
                                                <button
                                                    onClick={() => handleToggleEliminated(apId, true)}
                                                    title="Restore to rankings"
                                                    className="text-[#6c6c6c] hover:text-black transition-colors"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleToggleEliminated(apId, false)}
                                                    title="Eliminate from this position"
                                                    className="text-[#6c6c6c] hover:text-red-500 transition-colors"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
