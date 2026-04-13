import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSettings, usePositions } from "../../lib/hooks";
import { supabase } from "../../lib/supabase";

const fieldCls =
    "w-full border border-[#dbe0ec] bg-white px-4 py-3 font-['Radio_Canada_Big',sans-serif] text-sm text-black outline-none focus:border-black transition-colors placeholder-[#6c6c6c]";

const labelCls =
    "font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em] block mb-2";

export function AdminSettings() {
    const { settings, loading, updateSetting } = useSettings();
    const { positions, refetch: refetchPositions } = usePositions();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [appWindowOpen, setAppWindowOpen] = useState(false);
    const [interviewsOpen, setInterviewsOpen] = useState(false);
const [limitMode, setLimitMode] = useState<"characters" | "words">(
        "characters",
    );
    const [deadline, setDeadline] = useState("");
    const [interviewWindow, setInterviewWindow] = useState("");
    const [decisionsDate, setDecisionsDate] = useState("");

    // New position form
    const [newPosTitle, setNewPosTitle] = useState("");
    const [newPosDesc, setNewPosDesc] = useState("");
    const [newPosSpots, setNewPosSpots] = useState("1");

    useEffect(() => {
        if (!loading) {
            setMaintenanceMode(
                settings.maintenance_mode === true ||
                    settings.maintenance_mode === "true",
            );
            setAppWindowOpen(
                settings.application_window_open === true ||
                    settings.application_window_open === "true",
            );
            setInterviewsOpen(
                settings.interview_scheduling_open === true ||
                    settings.interview_scheduling_open === "true",
            );
setLimitMode(
                settings.limit_mode === "words" ? "words" : "characters",
            );
            setDeadline(
                typeof settings.application_deadline === "string"
                    ? settings.application_deadline
                    : "",
            );
            setInterviewWindow(
                typeof settings.interview_window === "string"
                    ? settings.interview_window
                    : "",
            );
            setDecisionsDate(
                typeof settings.decisions_date === "string"
                    ? settings.decisions_date
                    : "",
            );
        }
    }, [settings, loading]);

    const handleAddPosition = async () => {
        if (!newPosTitle.trim()) return;
        setError(null);
        const { error: err } = await supabase.from("positions").insert({
            title: newPosTitle.trim(),
            description: newPosDesc.trim(),
            spots: parseInt(newPosSpots) || 1,
            sort_order: positions.length,
        });
        if (err) {
            console.error("Failed to add position:", err);
            setError(`Failed to add position: ${err.message}`);
            return;
        }
        setNewPosTitle("");
        setNewPosDesc("");
        setNewPosSpots("1");
        toast.success("Position added");
        refetchPositions();
    };

    const handleTogglePosition = async (id: string, is_open: boolean) => {
        setError(null);
        const { error: err } = await supabase
            .from("positions")
            .update({ is_open: !is_open })
            .eq("id", id);
        if (err) {
            setError(`Failed to toggle position: ${err.message}`);
        }
        refetchPositions();
    };

    const handleDeletePosition = async (id: string) => {
        setError(null);
        const { error: err } = await supabase
            .from("positions")
            .delete()
            .eq("id", id);
        if (err) {
            setError(`Failed to delete position: ${err.message}`);
        }
        refetchPositions();
    };

    const handleUpdateSpots = async (id: string, spots: number) => {
        await supabase.from("positions").update({ spots }).eq("id", id);
        refetchPositions();
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            await updateSetting("application_window_open", appWindowOpen);
            await updateSetting("interview_scheduling_open", interviewsOpen);
await updateSetting("limit_mode", limitMode);
            await updateSetting("application_deadline", deadline);
            await updateSetting("interview_window", interviewWindow);
            await updateSetting("decisions_date", decisionsDate);
            toast.success("Settings saved");
        } catch (e: any) {
            setError(`Failed to save settings: ${e.message}`);
        }
        setSaving(false);
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
                    Admin — 07
                </p>
                <h1
                    className="font-['Source_Serif_4',serif] text-[40px] text-black tracking-[-1.2px]"
                    style={{ lineHeight: 1.05 }}
                >
                    Application
                    <br />
                    Settings
                </h1>
                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-lg tracking-[-0.3px] mt-2">
                    Configure the application cycle, deadlines, and executive
                    positions.
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

            {/* Maintenance Mode */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                        Maintenance Mode
                    </h2>
                    <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                        000
                    </span>
                </div>
                <div className={`border px-6 py-5 flex items-center justify-between ${maintenanceMode ? "border-red-400 bg-red-50" : "border-[#dbe0ec]"}`}>
                    <div className="flex items-start gap-4">
                        <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] w-6 mt-0.5">
                            !!
                        </span>
                        <div>
                            <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                Error 67 — Shut Down Site
                            </p>
                            <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm mt-0.5">
                                Instantly replaces all pages with "Error 67" for every user. Unsaved data is preserved underneath.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={async () => {
                            const next = !maintenanceMode;
                            setMaintenanceMode(next);
                            await updateSetting("maintenance_mode", next);
                            toast.success(next ? "Maintenance mode ON — site is down" : "Maintenance mode OFF — site is live");
                        }}
                        className={`relative w-12 h-6 transition-colors shrink-0 ${maintenanceMode ? "bg-red-500" : "bg-[#dbe0ec]"}`}
                    >
                        <div
                            className={`absolute top-1 w-4 h-4 bg-white transition-all ${maintenanceMode ? "left-7" : "left-1"}`}
                        />
                    </button>
                </div>
            </section>

            {/* Cycle States */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                        Cycle States
                    </h2>
                    <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                        001
                    </span>
                </div>

                <div className="border border-[#dbe0ec] space-y-0">
                    {[
                        {
                            label: "Application Window",
                            desc: "Allow students to submit new executive applications.",
                            value: appWindowOpen,
                            setter: setAppWindowOpen,
                        },
                        {
                            label: "Interview Scheduling",
                            desc: "Enable applicants to book interview slots.",
                            value: interviewsOpen,
                            setter: setInterviewsOpen,
                        },
].map((item, i) => (
                        <div
                            key={item.label}
                            className={`flex items-center justify-between px-6 py-5 ${i !== 0 ? "border-t border-[#dbe0ec]" : ""}`}
                        >
                            <div className="flex items-start gap-4">
                                <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] w-6 mt-0.5">
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                                <div>
                                    <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                        {item.label}
                                    </p>
                                    <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm mt-0.5">
                                        {item.desc}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => item.setter(!item.value)}
                                className={`relative w-12 h-6 transition-colors shrink-0 ${item.value ? "bg-black" : "bg-[#dbe0ec]"}`}
                            >
                                <div
                                    className={`absolute top-1 w-4 h-4 bg-white transition-all ${item.value ? "left-7" : "left-1"}`}
                                />
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            {/* Response Limit Mode */}
            <section>
                <div className="flex items-center justify-between py-5 border-t border-[#dbe0ec]">
                    <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                        Response Limits
                    </h2>
                    <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                        002
                    </span>
                </div>
                <div className="border border-[#dbe0ec] px-6 py-5">
                    <div className="flex items-start gap-4">
                        <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] w-6 mt-0.5">
                            01
                        </span>
                        <div className="flex-1">
                            <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                Limit Mode
                            </p>
                            <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm mt-0.5 mb-4">
                                Choose whether FRQ limits are counted by
                                characters or words.
                            </p>
                            <div className="flex gap-3">
                                {(["characters", "words"] as const).map(
                                    (mode) => (
                                        <button
                                            key={mode}
                                            onClick={() => setLimitMode(mode)}
                                            className={`px-4 py-2 font-['Geist_Mono',monospace] text-[12px] border transition-colors ${
                                                limitMode === mode
                                                    ? "bg-black text-white border-black"
                                                    : "bg-white text-black border-[#dbe0ec] hover:border-black"
                                            }`}
                                        >
                                            {mode === "characters"
                                                ? "Character-based"
                                                : "Word-based"}
                                        </button>
                                    ),
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Dates */}
            <section>
                <div className="flex items-center justify-between py-5 border-t border-[#dbe0ec]">
                    <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                        Key Dates
                    </h2>
                    <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                        003
                    </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div>
                        <label className={labelCls}>Application Deadline</label>
                        <input
                            type="date"
                            className={fieldCls}
                            value={deadline}
                            onChange={(e) => setDeadline(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Interview Window</label>
                        <input
                            className={fieldCls}
                            value={interviewWindow}
                            onChange={(e) => setInterviewWindow(e.target.value)}
                            placeholder="e.g. May 5 – May 12, 2026"
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Decisions Date</label>
                        <input
                            type="date"
                            className={fieldCls}
                            value={decisionsDate}
                            onChange={(e) => setDecisionsDate(e.target.value)}
                        />
                    </div>
                </div>
            </section>

            {/* Positions Management */}
            <section>
                <div className="flex items-center justify-between py-5 border-t border-[#dbe0ec]">
                    <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                        Executive Positions
                    </h2>
                    <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                        004
                    </span>
                </div>

                <div className="border border-[#dbe0ec]">
                    {positions.map((pos: any, i: number) => (
                        <div
                            key={pos.id}
                            className={`flex items-center justify-between px-6 py-4 ${i !== 0 ? "border-t border-[#dbe0ec]" : ""}`}
                        >
                            <div className="flex items-start gap-4 flex-1">
                                <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] shrink-0 mt-0.5">
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                                <div className="flex-1">
                                    <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                        {pos.title}
                                    </p>
                                    {pos.description && (
                                        <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm mt-0.5">
                                            {pos.description}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <div className="flex items-center gap-1.5">
                                    <label className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c]">
                                        Spots:
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        className="w-12 border border-[#dbe0ec] bg-white px-2 py-0.5 font-['Geist_Mono',monospace] text-[11px] text-black text-center outline-none focus:border-black"
                                        value={pos.spots || 1}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(
                                                /\D/g,
                                                "",
                                            );
                                            handleUpdateSpots(
                                                pos.id,
                                                parseInt(val) || 1,
                                            );
                                        }}
                                    />
                                </div>
                                <button
                                    onClick={() =>
                                        handleTogglePosition(
                                            pos.id,
                                            pos.is_open,
                                        )
                                    }
                                    className={`font-['Geist_Mono',monospace] text-[11px] px-2 py-0.5 border ${pos.is_open ? "border-black text-black" : "border-[#dbe0ec] text-[#6c6c6c]"}`}
                                >
                                    {pos.is_open ? "Open" : "Closed"}
                                </button>
                                <button
                                    onClick={() => handleDeletePosition(pos.id)}
                                    className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] hover:text-black transition-colors"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}

                    <div className="border-t border-dashed border-[#dbe0ec] px-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                            <div className="md:col-span-4">
                                <label className={labelCls}>
                                    Position Title
                                </label>
                                <input
                                    className={fieldCls}
                                    value={newPosTitle}
                                    onChange={(e) =>
                                        setNewPosTitle(e.target.value)
                                    }
                                    placeholder="e.g. Director of PR"
                                />
                            </div>
                            <div className="md:col-span-4">
                                <label className={labelCls}>Description</label>
                                <input
                                    className={fieldCls}
                                    value={newPosDesc}
                                    onChange={(e) =>
                                        setNewPosDesc(e.target.value)
                                    }
                                    placeholder="Brief description..."
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className={labelCls}>Spots</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    className={fieldCls}
                                    value={newPosSpots}
                                    onChange={(e) =>
                                        setNewPosSpots(
                                            e.target.value.replace(/\D/g, ""),
                                        )
                                    }
                                    placeholder="1"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <button
                                    onClick={handleAddPosition}
                                    className="w-full bg-black flex gap-[10px] items-center justify-center px-4 py-3 hover:bg-zinc-800 transition-colors"
                                >
                                    <span className="font-['Geist_Mono',monospace] text-[12px] text-white whitespace-nowrap leading-none">
                                        + Add
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Save */}
            <div className="flex justify-end pt-4 border-t border-[#dbe0ec]">
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
                                Save Changes
                            </span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
