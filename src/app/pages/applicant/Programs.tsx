import { useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { Search, Check, Plus, Minus, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { parseISO, format } from "date-fns";
import { useAuth } from "../../lib/AuthContext";
import { usePositions, useApplication, useSettings } from "../../lib/hooks";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";

function formatDeadline(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const d = parseISO(raw);
    if (isNaN(d.getTime())) return raw; // fallback to raw string if not ISO
    return format(d, "MMMM d, yyyy");
  } catch {
    return raw;
  }
}

export function ApplicantPrograms() {
  const { profile } = useAuth();
  const { positions, loading: positionsLoading } = usePositions();
  const { application, loading: appLoading, refetch } = useApplication(profile?.id);
  const { settings, loading: settingsLoading } = useSettings();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [rankUpdating, setRankUpdating] = useState<string | null>(null);

  const manualWindowOpen = settings.application_window_open === true || settings.application_window_open === "true";

  // Also check if we're past the deadline date
  const deadlineStr = typeof settings.application_deadline === "string" ? settings.application_deadline : null;
  const deadlinePassed = (() => {
    if (!deadlineStr) return false;
    try {
      const d = parseISO(deadlineStr);
      if (isNaN(d.getTime())) return false;
      // Deadline is end-of-day, so add a day buffer
      const endOfDeadline = new Date(d);
      endOfDeadline.setHours(23, 59, 59, 999);
      return new Date() > endOfDeadline;
    } catch {
      return false;
    }
  })();

  const appWindowOpen = manualWindowOpen && !deadlinePassed;
  const deadlineDisplay = formatDeadline(deadlineStr);

  const appliedPositionIds = new Set(
    application?.application_positions?.map((ap: any) => ap.position_id) ?? []
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isDraft = !application || application.status === "draft";
  const isSubmitted = application && application.status !== "draft";

  // Get applied positions sorted by rank
  const appliedPositions: any[] = (application?.application_positions ?? [])
    .slice()
    .sort((a: any, b: any) => (a.position_rank ?? 999) - (b.position_rank ?? 999));

  const toggleSelection = (positionId: string) => {
    if (isSubmitted || appliedPositionIds.has(positionId)) return;
    const newSet = new Set(selectedIds);
    if (newSet.has(positionId)) {
      newSet.delete(positionId);
    } else {
      newSet.add(positionId);
    }
    setSelectedIds(newSet);
  };

  const handleRemovePosition = async (positionId: string) => {
    if (!application || !isDraft) return;
    setRemovingId(positionId);
    const { error } = await supabase
      .from("application_positions")
      .delete()
      .eq("application_id", application.id)
      .eq("position_id", positionId);
    if (error) {
      console.error("Failed to remove position:", error);
      toast.error("Failed to remove position");
    } else {
      // Re-rank remaining positions after removal
      const remaining = appliedPositions
        .filter((ap: any) => ap.position_id !== positionId)
        .sort((a: any, b: any) => (a.position_rank ?? 999) - (b.position_rank ?? 999));
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].position_rank !== i + 1) {
          await supabase
            .from("application_positions")
            .update({ position_rank: i + 1 })
            .eq("id", remaining[i].id);
        }
      }
      toast.success("Position removed");
      await refetch();
    }
    setRemovingId(null);
  };

  const handleMoveRank = async (applicationPositionId: string, direction: "up" | "down") => {
    if (!application || !isDraft) return;
    setRankUpdating(applicationPositionId);

    const currentIndex = appliedPositions.findIndex((ap: any) => ap.id === applicationPositionId);
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (swapIndex < 0 || swapIndex >= appliedPositions.length) {
      setRankUpdating(null);
      return;
    }

    const current = appliedPositions[currentIndex];
    const swap = appliedPositions[swapIndex];
    const currentRank = current.position_rank ?? currentIndex + 1;
    const swapRank = swap.position_rank ?? swapIndex + 1;

    const [res1, res2] = await Promise.all([
      supabase.from("application_positions").update({ position_rank: swapRank }).eq("id", current.id),
      supabase.from("application_positions").update({ position_rank: currentRank }).eq("id", swap.id),
    ]);

    if (res1.error || res2.error) {
      toast.error("Failed to update ranking");
    }

    await refetch();
    setRankUpdating(null);
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);

    let appId = application?.id;

    // Create the single application row if it doesn't exist yet
    if (!appId) {
      // Check for existing application first (cache may be stale)
      const { data: existing } = await supabase
        .from("applications")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (existing) {
        appId = existing.id;
        await refetch();
      } else {
        const { data, error } = await supabase
          .from("applications")
          .insert({ user_id: profile.id, status: "draft" })
          .select()
          .single();
        if (error || !data) {
          console.error("Failed to create application:", error);
          toast.error("Failed to create application");
          setSaving(false);
          return;
        }
        appId = data.id;
      }
    }

    // Determine next rank start (after existing positions)
    const existingMaxRank = appliedPositions.reduce(
      (max: number, ap: any) => Math.max(max, ap.position_rank ?? 0),
      0
    );

    // Insert selected positions into junction table with sequential ranks
    const newIds = [...selectedIds].filter((id) => !appliedPositionIds.has(id));
    const toInsert = newIds.map((position_id, i) => ({
      application_id: appId,
      position_id,
      position_rank: existingMaxRank + i + 1,
    }));

    let count = 0;
    if (toInsert.length > 0) {
      const { error } = await supabase
        .from("application_positions")
        .insert(toInsert);
      if (error) {
        console.error("Failed to add positions:", error);
        toast.error("Failed to save positions");
      } else {
        count = toInsert.length;
      }
    }

    await refetch();
    setSelectedIds(new Set());
    setSaving(false);
    if (count > 0) {
      toast.success(`${count} position${count !== 1 ? "s" : ""} saved, ${profile?.first_name}! Now complete your application.`);
      setJustSaved(true);
    }
  };

  const filteredPositions = positions.filter(
    (p: any) =>
      p.is_open &&
      (p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.description || "").toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const hasPositions = (application?.application_positions?.length ?? 0) > 0;

  if (positionsLoading || appLoading || settingsLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#6c6c6c]" />
      </div>
    );
  }

  if (!appWindowOpen && !hasPositions) {
    return (
      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <header className="border-b border-[#dbe0ec] pb-8">
          <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.1em] mb-3">Step 02</p>
          <h1 className="font-['Source_Serif_4',serif] text-[48px] text-black tracking-[-1.5px]" style={{ lineHeight: 1.05 }}>
            Executive<br />Positions
          </h1>
          <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-lg tracking-[-0.3px] mt-2">
            {deadlinePassed && deadlineDisplay
              ? `The application deadline (${deadlineDisplay}) has passed. Applications are now closed.`
              : "The application window is currently closed. Check back when applications open."}
          </p>
          {!deadlinePassed && deadlineDisplay && (
            <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] mt-3">
              Deadline: {deadlineDisplay}
            </p>
          )}
        </header>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
      {/* Header */}
      <header className="border-b border-[#dbe0ec] pb-8">
        <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.1em] mb-3">
          Step 02
        </p>
        <h1
          className="font-['Source_Serif_4',serif] text-[48px] text-black tracking-[-1.5px]"
          style={{ lineHeight: 1.05 }}
        >
          Executive<br />Positions
        </h1>
        <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-lg tracking-[-0.3px] mt-2">
          Browse available positions and select the ones you want to apply for.
        </p>
      </header>

      {isSubmitted && (
        <div className="border border-[#dbe0ec] bg-[#f9f9f7] px-5 py-4">
          <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">Your application has been submitted. This section is locked.</p>
        </div>
      )}

      {/* Ranking Section — shown when user has applied positions */}
      {appliedPositions.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em]">
              Your Preference Ranking
            </p>
            <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] border border-[#dbe0ec] px-2 py-0.5">
              {appliedPositions.length} position{appliedPositions.length !== 1 ? "s" : ""}
            </span>
          </div>
          <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm mb-4 tracking-[-0.2px]">
            {isDraft
              ? "Use the arrows to rank your positions by preference. #1 is your most preferred."
              : "Your submitted preference ranking is shown below."}
          </p>
          <div className="border border-[#dbe0ec]">
            {appliedPositions.map((ap: any, i: number) => {
              const isUpdatingRank = rankUpdating === ap.id;
              const isRemoving = removingId === ap.position_id;
              return (
                <div
                  key={ap.id}
                  className={cn(
                    "flex items-center gap-4 px-5 py-4",
                    i !== 0 && "border-t border-[#dbe0ec]"
                  )}
                >
                  {/* Rank badge */}
                  <span className="font-['Geist_Mono',monospace] text-[13px] text-black font-medium w-7 text-center shrink-0">
                    #{ap.position_rank ?? i + 1}
                  </span>
                  {/* Title */}
                  <div className="flex-1 min-w-0">
                    <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm truncate">
                      {ap.positions?.title || "Unknown Position"}
                    </p>
                  </div>
                  {/* Controls */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isDraft && (
                      <>
                        <button
                          onClick={() => handleMoveRank(ap.id, "up")}
                          disabled={i === 0 || isUpdatingRank}
                          className={cn(
                            "w-7 h-7 border flex items-center justify-center transition-colors",
                            i === 0
                              ? "border-[#eee] text-[#ccc] cursor-not-allowed"
                              : "border-[#dbe0ec] text-[#6c6c6c] hover:border-black hover:text-black"
                          )}
                          title="Move up"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleMoveRank(ap.id, "down")}
                          disabled={i === appliedPositions.length - 1 || isUpdatingRank}
                          className={cn(
                            "w-7 h-7 border flex items-center justify-center transition-colors",
                            i === appliedPositions.length - 1
                              ? "border-[#eee] text-[#ccc] cursor-not-allowed"
                              : "border-[#dbe0ec] text-[#6c6c6c] hover:border-black hover:text-black"
                          )}
                          title="Move down"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRemovePosition(ap.position_id)}
                          disabled={isRemoving}
                          className="w-7 h-7 border border-[#dbe0ec] flex items-center justify-center hover:border-red-400 hover:text-red-500 transition-colors text-[#6c6c6c] disabled:opacity-50 ml-1"
                          title="Remove position"
                        >
                          {isRemoving ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Minus className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </>
                    )}
                    {isUpdatingRank && (
                      <Loader2 className="w-3 h-3 animate-spin text-[#6c6c6c]" />
                    )}
                    {!isDraft && (
                      <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] border border-[#dbe0ec] px-2 py-0.5">
                        Applied
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search */}
      {!isSubmitted && (
        <>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6c6c6c] w-4 h-4" />
            <input
              type="text"
              placeholder="Search positions..."
              className="w-full border border-[#dbe0ec] bg-white pl-11 pr-4 py-3.5 font-['Radio_Canada_Big',sans-serif] text-sm text-black placeholder-[#6c6c6c] outline-none focus:border-black transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Position list */}
          <div className="space-y-0 border border-[#dbe0ec]">
            {filteredPositions.map((pos: any, i: number) => {
              const isApplied = appliedPositionIds.has(pos.id);
              const isSelected = selectedIds.has(pos.id) || isApplied;
              const isRemoving = removingId === pos.id;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  key={pos.id}
                  className={cn("p-6", i !== 0 && "border-t border-[#dbe0ec]")}
                >
                  <div className="w-full flex items-center justify-between text-left">
                    <button
                      onClick={() => {
                        if (!isApplied) toggleSelection(pos.id);
                      }}
                      disabled={isApplied}
                      className={cn(
                        "flex items-start gap-4 flex-1 text-left transition-colors",
                        isApplied && "opacity-70 cursor-not-allowed"
                      )}
                    >
                      <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] mt-0.5 w-6 shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-lg tracking-[-0.3px]">
                            {pos.title}
                          </h3>
                        </div>
                        <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-base mt-0.5 tracking-[-0.2px]">
                          {pos.description}
                        </p>
                        {isApplied && (
                          <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] border border-[#dbe0ec] px-2 py-0.5 mt-2 inline-block">
                            {(() => {
                              const ap = appliedPositions.find((a: any) => a.position_id === pos.id);
                              return `Preference #${ap?.position_rank ?? "—"}`;
                            })()}
                          </span>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      {!isApplied && (
                        <button
                          onClick={() => toggleSelection(pos.id)}
                          className={cn(
                            "w-5 h-5 border flex items-center justify-center",
                            isSelected ? "border-black bg-black" : "border-[#dbe0ec]"
                          )}
                        >
                          {isSelected ? (
                            <Check className="w-3 h-3 text-white" />
                          ) : (
                            <Plus className="w-3 h-3 text-[#6c6c6c]" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {filteredPositions.length === 0 && (
              <div className="px-6 py-16 text-center">
                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-base">
                  No positions matching "{searchTerm}"
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Fixed footer */}
      {selectedIds.size > 0 && !isSubmitted && (
        <div className="fixed bottom-0 left-60 right-0 bg-white border-t border-[#dbe0ec] px-8 py-4 flex justify-between items-center z-20">
          <div>
            <span className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
              {selectedIds.size} new position{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] mt-0.5">
              New positions will be added after your current rankings.
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-black flex gap-[10px] items-center justify-center px-5 py-3.5 hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            ) : (
              <>
                <div className="bg-white shrink-0 w-[5px] h-[5px]" />
                <span className="font-['Geist_Mono',monospace] text-[13px] text-white whitespace-nowrap leading-none">
                  Save Selection
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
