import { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import { Loader2, Sparkles, RotateCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAllApplications, useSettings } from "../../lib/hooks";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";

type Provider = "gemini" | "openai";

interface AnalysisRow {
    applicationId: string;
    applicantName: string;
    email: string;
    positions: string[];
    avgScore: number | null;
    questionCount: number;
    analyzedCount: number;
    lastAnalyzed: string | null;
}

function scoreColor(score: number): string {
    if (score >= 0.8) return "text-red-600";
    if (score >= 0.6) return "text-orange-500";
    if (score >= 0.4) return "text-amber-500";
    return "text-black";
}

function scoreBg(score: number): string {
    if (score >= 0.8) return "bg-red-600";
    if (score >= 0.6) return "bg-orange-500";
    if (score >= 0.4) return "bg-amber-500";
    return "bg-black";
}

export function AdminAIAnalysis() {
    const { applications, loading: appsLoading } = useAllApplications();
    const { settings, loading: settingsLoading } = useSettings();
    const [provider, setProvider] = useState<Provider>("gemini");
    const [analysisResults, setAnalysisResults] = useState<
        Record<string, any[]>
    >({});
    const [loadingResults, setLoadingResults] = useState(true);
    const [runningId, setRunningId] = useState<string | null>(null);
    const [batchRunning, setBatchRunning] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
    const abortRef = useRef(false);

    const aiEnabled =
        settings.ai_analysis_enabled === true ||
        settings.ai_analysis_enabled === "true";

    // Filter to only submitted+ applications
    const submittedApps = applications.filter(
        (app: any) => app.status !== "draft",
    );

    // Fetch all existing analysis results
    useEffect(() => {
        const fetchResults = async () => {
            const { data } = await supabase
                .from("ai_analysis_results")
                .select("application_id, question_id, similarity_score, updated_at");
            const grouped: Record<string, any[]> = {};
            (data || []).forEach((r: any) => {
                if (!grouped[r.application_id]) grouped[r.application_id] = [];
                grouped[r.application_id].push(r);
            });
            setAnalysisResults(grouped);
            setLoadingResults(false);
        };
        fetchResults();
    }, []);

    // Build table rows
    const rows: AnalysisRow[] = submittedApps.map((app: any) => {
        const prof = app.profiles;
        const name = prof
            ? `${prof.first_name || ""} ${prof.last_name || ""}`.trim() ||
              prof.email
            : "Unknown";
        const positions = (app.application_positions || [])
            .map((ap: any) => ap.positions?.title)
            .filter(Boolean);
        const results = analysisResults[app.id] || [];
        const scores = results.map((r: any) => r.similarity_score);
        const avgScore =
            scores.length > 0
                ? scores.reduce((a: number, b: number) => a + b, 0) /
                  scores.length
                : null;
        const lastAnalyzed = results.length > 0
            ? results.reduce(
                  (latest: string, r: any) =>
                      r.updated_at > latest ? r.updated_at : latest,
                  results[0].updated_at,
              )
            : null;
        return {
            applicationId: app.id,
            applicantName: name,
            email: prof?.email || "",
            positions,
            avgScore,
            questionCount: 0, // We don't have this without extra query; analyzedCount suffices
            analyzedCount: results.length,
            lastAnalyzed,
        };
    });

    // Sort by score descending (analyzed first, then unanalyzed)
    const sortedRows = [...rows].sort((a, b) => {
        if (a.avgScore === null && b.avgScore === null) return 0;
        if (a.avgScore === null) return 1;
        if (b.avgScore === null) return -1;
        return b.avgScore - a.avgScore;
    });

    const runAnalysis = async (applicationId: string) => {
        setRunningId(applicationId);
        try {
            const { data, error } = await supabase.functions.invoke(
                "ai-analysis",
                {
                    body: { applicationId, provider },
                },
            );
            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            // Update local results
            const { data: updated } = await supabase
                .from("ai_analysis_results")
                .select(
                    "application_id, question_id, similarity_score, updated_at",
                )
                .eq("application_id", applicationId);
            setAnalysisResults((prev) => ({
                ...prev,
                [applicationId]: updated || [],
            }));
            toast.success("Analysis complete");
        } catch (e: any) {
            toast.error(`Analysis failed: ${e.message}`);
        }
        setRunningId(null);
    };

    const runBatchAnalysis = async () => {
        const toAnalyze = submittedApps.filter(
            (app: any) => app.status !== "draft",
        );
        setBatchRunning(true);
        setBatchProgress({ done: 0, total: toAnalyze.length });
        abortRef.current = false;

        for (let i = 0; i < toAnalyze.length; i++) {
            if (abortRef.current) break;
            const app = toAnalyze[i];
            try {
                const { data, error } = await supabase.functions.invoke(
                    "ai-analysis",
                    {
                        body: { applicationId: app.id, provider },
                    },
                );
                if (error) console.error(`Failed for ${app.id}:`, error);

                // Update local results for this app
                const { data: updated } = await supabase
                    .from("ai_analysis_results")
                    .select(
                        "application_id, question_id, similarity_score, updated_at",
                    )
                    .eq("application_id", app.id);
                setAnalysisResults((prev) => ({
                    ...prev,
                    [app.id]: updated || [],
                }));
            } catch (e) {
                console.error(`Failed for ${app.id}:`, e);
            }
            setBatchProgress({ done: i + 1, total: toAnalyze.length });

            // Rate limit delay between apps (4s for Gemini free tier)
            if (i < toAnalyze.length - 1 && !abortRef.current) {
                await new Promise((r) => setTimeout(r, 4000));
            }
        }

        setBatchRunning(false);
        toast.success("Batch analysis complete");
    };

    const loading = appsLoading || settingsLoading || loadingResults;

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
                    Admin — 07
                </p>
                <h1
                    className="font-['Source_Serif_4',serif] text-[40px] text-black tracking-[-1.2px]"
                    style={{ lineHeight: 1.05 }}
                >
                    AI Response
                    <br />
                    Analysis
                </h1>
                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-lg tracking-[-0.3px] mt-2">
                    Detect potential AI usage by comparing applicant responses to
                    AI-generated versions.
                </p>
            </header>

            {!aiEnabled ? (
                <div className="border border-[#dbe0ec] bg-white px-6 py-8 text-center">
                    <Sparkles className="w-8 h-8 text-[#6c6c6c] mx-auto mb-3" />
                    <p className="font-['Radio_Canada_Big',sans-serif] text-black text-sm font-medium mb-1">
                        AI Analysis is disabled
                    </p>
                    <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm mb-4">
                        Enable it in Settings to start analyzing applications.
                    </p>
                    <Link
                        to="/admin/settings"
                        className="inline-flex items-center gap-2 bg-black px-4 py-2.5 hover:bg-zinc-800 transition-colors"
                    >
                        <span className="font-['Geist_Mono',monospace] text-[12px] text-white">
                            Go to Settings
                        </span>
                    </Link>
                </div>
            ) : (
                <>
                    {/* Controls */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                                Batch Analysis
                            </h2>
                            <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                                001
                            </span>
                        </div>

                        <div className="border border-[#dbe0ec] bg-white px-6 py-5">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    {/* Provider selector */}
                                    <div className="flex gap-2">
                                        {(
                                            ["gemini", "openai"] as const
                                        ).map((p) => (
                                            <button
                                                key={p}
                                                onClick={() => setProvider(p)}
                                                disabled={batchRunning}
                                                className={cn(
                                                    "px-3 py-1.5 font-['Geist_Mono',monospace] text-[11px] border transition-colors",
                                                    provider === p
                                                        ? "bg-black text-white border-black"
                                                        : "bg-white text-black border-[#dbe0ec] hover:border-black",
                                                )}
                                            >
                                                {p === "gemini"
                                                    ? "Gemini"
                                                    : "OpenAI"}
                                            </button>
                                        ))}
                                    </div>

                                    <span className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm">
                                        {submittedApps.length} submitted
                                        application
                                        {submittedApps.length !== 1 ? "s" : ""}
                                    </span>
                                </div>

                                <div className="flex items-center gap-3">
                                    {batchRunning && (
                                        <button
                                            onClick={() => {
                                                abortRef.current = true;
                                            }}
                                            className="px-3 py-2 border border-[#dbe0ec] font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] hover:border-black hover:text-black transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                    <button
                                        onClick={runBatchAnalysis}
                                        disabled={
                                            batchRunning ||
                                            submittedApps.length === 0
                                        }
                                        className="bg-black flex gap-[10px] items-center justify-center px-4 py-2.5 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                                    >
                                        {batchRunning ? (
                                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                                        ) : (
                                            <div className="bg-white shrink-0 w-[5px] h-[5px]" />
                                        )}
                                        <span className="font-['Geist_Mono',monospace] text-[12px] text-white whitespace-nowrap leading-none">
                                            {batchRunning
                                                ? `${batchProgress.done}/${batchProgress.total}`
                                                : "Run All Submitted"}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* Progress bar */}
                            {batchRunning && (
                                <div className="mt-4">
                                    <div className="h-1 bg-[#dbe0ec] w-full">
                                        <div
                                            className="h-1 bg-black transition-all duration-300"
                                            style={{
                                                width: `${batchProgress.total > 0 ? (batchProgress.done / batchProgress.total) * 100 : 0}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Results table */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                                Results
                            </h2>
                            <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                                002
                            </span>
                        </div>

                        <div className="border border-[#dbe0ec] bg-white">
                            {/* Table header */}
                            <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-[#dbe0ec] bg-[#f9f9f7]">
                                <div className="col-span-4">
                                    <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em]">
                                        Applicant
                                    </span>
                                </div>
                                <div className="col-span-3">
                                    <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em]">
                                        Positions
                                    </span>
                                </div>
                                <div className="col-span-2 text-center">
                                    <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em]">
                                        Similarity
                                    </span>
                                </div>
                                <div className="col-span-3 text-right">
                                    <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em]">
                                        Actions
                                    </span>
                                </div>
                            </div>

                            {sortedRows.length === 0 ? (
                                <div className="px-6 py-8 text-center">
                                    <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm">
                                        No submitted applications found.
                                    </p>
                                </div>
                            ) : (
                                sortedRows.map((row, i) => (
                                    <div
                                        key={row.applicationId}
                                        className={cn(
                                            "grid grid-cols-12 gap-4 px-6 py-4 items-center",
                                            i !== 0 &&
                                                "border-t border-[#dbe0ec]",
                                        )}
                                    >
                                        {/* Applicant */}
                                        <div className="col-span-4">
                                            <p className="font-['Radio_Canada_Big',sans-serif] text-black text-sm font-medium">
                                                {row.applicantName}
                                            </p>
                                            <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                                {row.email}
                                            </p>
                                        </div>

                                        {/* Positions */}
                                        <div className="col-span-3">
                                            <div className="flex flex-wrap gap-1">
                                                {row.positions.map((pos) => (
                                                    <span
                                                        key={pos}
                                                        className="font-['Geist_Mono',monospace] text-[10px] border border-[#dbe0ec] text-[#6c6c6c] px-1.5 py-0.5"
                                                    >
                                                        {pos}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Score */}
                                        <div className="col-span-2 text-center">
                                            {row.avgScore !== null ? (
                                                <div>
                                                    <span
                                                        className={cn(
                                                            "font-['Geist_Mono',monospace] text-sm font-medium",
                                                            scoreColor(
                                                                row.avgScore,
                                                            ),
                                                        )}
                                                    >
                                                        {(
                                                            row.avgScore * 100
                                                        ).toFixed(0)}
                                                        %
                                                    </span>
                                                    <div className="h-1 bg-[#dbe0ec] mt-1 mx-auto w-16">
                                                        <div
                                                            className={cn(
                                                                "h-1 transition-all",
                                                                scoreBg(
                                                                    row.avgScore,
                                                                ),
                                                            )}
                                                            style={{
                                                                width: `${row.avgScore * 100}%`,
                                                            }}
                                                        />
                                                    </div>
                                                    <p className="font-['Geist_Mono',monospace] text-[9px] text-[#6c6c6c] mt-1">
                                                        {row.analyzedCount}{" "}
                                                        response
                                                        {row.analyzedCount !== 1
                                                            ? "s"
                                                            : ""}
                                                    </p>
                                                </div>
                                            ) : (
                                                <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                                                    —
                                                </span>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="col-span-3 flex items-center justify-end gap-2">
                                            {row.lastAnalyzed && (
                                                <span className="font-['Geist_Mono',monospace] text-[9px] text-[#6c6c6c] mr-2">
                                                    {new Date(
                                                        row.lastAnalyzed,
                                                    ).toLocaleDateString(
                                                        "en-US",
                                                        {
                                                            month: "short",
                                                            day: "numeric",
                                                        },
                                                    )}
                                                </span>
                                            )}
                                            <button
                                                onClick={() =>
                                                    runAnalysis(
                                                        row.applicationId,
                                                    )
                                                }
                                                disabled={
                                                    runningId !== null ||
                                                    batchRunning
                                                }
                                                className="p-1.5 border border-[#dbe0ec] hover:border-black transition-colors disabled:opacity-50"
                                                title={
                                                    row.avgScore !== null
                                                        ? "Re-run"
                                                        : "Run"
                                                }
                                            >
                                                {runningId ===
                                                row.applicationId ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6c6c6c]" />
                                                ) : (
                                                    <RotateCw className="w-3.5 h-3.5 text-[#6c6c6c]" />
                                                )}
                                            </button>
                                            <Link
                                                to={`/admin/applications/${row.applicationId}`}
                                                className="p-1.5 border border-[#dbe0ec] hover:border-black transition-colors"
                                                title="View application"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5 text-[#6c6c6c]" />
                                            </Link>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
