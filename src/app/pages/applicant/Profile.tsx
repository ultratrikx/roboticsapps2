import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../lib/AuthContext";
import { useApplication } from "../../lib/hooks";
import { supabase } from "../../lib/supabase";
import { GRADE_LEVELS } from "../../data";
import { cn } from "../../lib/utils";

const fieldCls =
    "w-full border bg-white px-4 py-3 font-['Radio_Canada_Big',sans-serif] text-sm text-black outline-none focus:border-black transition-colors placeholder-[#6c6c6c]";

const selectCls =
    "w-full border border-[#dbe0ec] bg-white px-4 py-3 font-['Radio_Canada_Big',sans-serif] text-sm text-black outline-none focus:border-black transition-colors";

const labelCls =
    "font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em] block mb-2";

export function ApplicantProfile() {
    const { profile, refreshProfile } = useAuth();
    const { application } = useApplication(profile?.id);
    const isSubmitted = application && application.status !== "draft";
    const navigate = useNavigate();
    const [saving, setSaving] = useState(false);
    const [autoSaveState, setAutoSaveState] = useState<
        "idle" | "saving" | "saved"
    >("idle");
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [form, setForm] = useState({
        first_name: "",
        last_name: "",
        grade: "",
    });
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => {
        if (profile) {
            setForm({
                first_name: profile.first_name || "",
                last_name: profile.last_name || "",
                grade: profile.grade || "",
            });
        }
    }, [profile]);

    const autoSave = useCallback(
        async (formData: typeof form) => {
            if (!profile) return;
            // Don't autosave if required fields are empty — prevents writing blank values
            // to the DB which would trigger the onboarding redirect in ProtectedRoute.
            if (
                !formData.first_name.trim() ||
                !formData.last_name.trim() ||
                !formData.grade
            ) {
                setAutoSaveState("idle");
                return;
            }
            setAutoSaveState("saving");
            const { error } = await supabase
                .from("profiles")
                .update({
                    first_name: formData.first_name.trim(),
                    last_name: formData.last_name.trim(),
                    grade: formData.grade,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", profile.id);
            if (error) {
                console.error("Autosave failed:", error);
                setAutoSaveState("idle");
            } else {
                setAutoSaveState("saved");
                await refreshProfile();
            }
        },
        [profile, refreshProfile],
    );

    const handleChange = (field: string, value: string) => {
        const newForm = { ...form, [field]: value };
        setForm(newForm);
        setAutoSaveState("saving");

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => autoSave(newForm), 1000);
    };

    const handleBlur = (field: string) => {
        setTouched((prev) => ({ ...prev, [field]: true }));
    };

    const handleSaveAndContinue = async () => {
        if (!profile) return;

        // Validate required fields
        const errors: string[] = [];
        if (!form.first_name.trim()) errors.push("First name is required");
        if (!form.last_name.trim()) errors.push("Last name is required");
        if (!form.grade) errors.push("Grade is required");

        if (errors.length > 0) {
            setTouched({ first_name: true, last_name: true, grade: true });
            errors.forEach((e) => toast.error(e));
            return;
        }

        setSaving(true);
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

        const { error } = await supabase
            .from("profiles")
            .update({
                first_name: form.first_name,
                last_name: form.last_name,
                grade: form.grade,
                updated_at: new Date().toISOString(),
            })
            .eq("id", profile.id);
        if (error) {
            toast.error(`Failed to save profile: ${error.message}`);
            setSaving(false);
            return;
        }
        await refreshProfile();
        toast.success(`Profile updated, ${profile?.first_name}!`);
        setSaving(false);
        navigate("/applicant/activities");
    };

    const isFieldError = (field: string) => {
        return touched[field] && !form[field as keyof typeof form]?.trim();
    };

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <header className="border-b border-[#dbe0ec] pb-8">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.1em] mb-3">
                            Step 03
                        </p>
                        <h1
                            className="font-['Source_Serif_4',serif] text-[48px] text-black tracking-[-1.5px]"
                            style={{ lineHeight: 1.05 }}
                        >
                            Profile
                            <br />
                            Details
                        </h1>
                        <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-lg tracking-[-0.3px] mt-2">
                            Basic information about you. Changes are saved
                            automatically.
                        </p>
                    </div>
                    {/* Autosave indicator */}
                    <div className="flex items-center gap-2 border border-[#dbe0ec] px-3 py-2 mt-1 shrink-0">
                        {autoSaveState === "idle" && (
                            <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                                Ready
                            </span>
                        )}
                        {autoSaveState === "saving" && (
                            <div className="flex items-center gap-1.5">
                                <Loader2 className="w-3 h-3 animate-spin text-[#6c6c6c]" />
                                <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                                    Saving...
                                </span>
                            </div>
                        )}
                        {autoSaveState === "saved" && (
                            <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3 h-3 text-black" />
                                <span className="font-['Geist_Mono',monospace] text-[11px] text-black">
                                    Saved
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {isSubmitted && (
                <div className="border border-[#dbe0ec] bg-[#f9f9f7] px-5 py-4">
                    <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                        Your application has been submitted. This section is
                        locked.
                    </p>
                </div>
            )}

            {/* Personal Info */}
            <section>
                <div className="flex items-center justify-between py-5 border-t border-[#dbe0ec]">
                    <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                        Personal Information
                    </h2>
                    <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                        001
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className={labelCls}>
                            First Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            className={cn(
                                fieldCls,
                                isFieldError("first_name")
                                    ? "border-red-400"
                                    : "border-[#dbe0ec]",
                                isSubmitted && "opacity-60 cursor-not-allowed",
                            )}
                            value={form.first_name}
                            onChange={(e) =>
                                handleChange("first_name", e.target.value)
                            }
                            onBlur={() => handleBlur("first_name")}
                            placeholder="Your first name"
                            disabled={!!isSubmitted}
                        />
                        {isFieldError("first_name") && (
                            <p className="font-['Geist_Mono',monospace] text-[10px] text-red-500 mt-1">
                                Required
                            </p>
                        )}
                    </div>
                    <div>
                        <label className={labelCls}>
                            Last Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            className={cn(
                                fieldCls,
                                isFieldError("last_name")
                                    ? "border-red-400"
                                    : "border-[#dbe0ec]",
                                isSubmitted && "opacity-60 cursor-not-allowed",
                            )}
                            value={form.last_name}
                            onChange={(e) =>
                                handleChange("last_name", e.target.value)
                            }
                            onBlur={() => handleBlur("last_name")}
                            placeholder="Your last name"
                            disabled={!!isSubmitted}
                        />
                        {isFieldError("last_name") && (
                            <p className="font-['Geist_Mono',monospace] text-[10px] text-red-500 mt-1">
                                Required
                            </p>
                        )}
                    </div>
                    <div>
                        <label className={labelCls}>Email</label>
                        <input
                            className={
                                fieldCls +
                                " border-[#dbe0ec] opacity-60 cursor-not-allowed"
                            }
                            type="email"
                            value={profile?.email || ""}
                            disabled
                        />
                    </div>
                    <div>
                        <label className={labelCls}>
                            Current Grade{" "}
                            <span className="text-red-500">*</span>
                        </label>
                        <select
                            className={cn(
                                selectCls,
                                isFieldError("grade") ? "border-red-400" : "",
                                isSubmitted && "opacity-60 cursor-not-allowed",
                            )}
                            value={form.grade}
                            onChange={(e) =>
                                handleChange("grade", e.target.value)
                            }
                            onBlur={() => handleBlur("grade")}
                            disabled={!!isSubmitted}
                        >
                            <option value="">Select Grade</option>
                            {GRADE_LEVELS.map((g) => (
                                <option key={g} value={g}>
                                    {g}
                                </option>
                            ))}
                        </select>
                        {isFieldError("grade") && (
                            <p className="font-['Geist_Mono',monospace] text-[10px] text-red-500 mt-1">
                                Required
                            </p>
                        )}
                    </div>
                </div>
            </section>

            {/* Footer nav */}
            <div className="flex justify-between items-center pt-6 border-t border-[#dbe0ec]">
                <button
                    onClick={() => navigate("/applicant/positions")}
                    className="font-['Geist_Mono',monospace] text-[12px] text-[#6c6c6c] hover:text-black transition-colors"
                >
                    ← Back
                </button>
                <button
                    onClick={handleSaveAndContinue}
                    disabled={saving || !!isSubmitted}
                    className={cn(
                        "bg-black flex gap-[10px] items-center justify-center px-5 py-3.5 hover:bg-zinc-800 transition-colors disabled:opacity-50",
                        isSubmitted && "cursor-not-allowed",
                    )}
                >
                    {saving ? (
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : (
                        <>
                            <div className="bg-white shrink-0 w-[5px] h-[5px]" />
                            <span className="font-['Geist_Mono',monospace] text-[13px] text-white whitespace-nowrap leading-none">
                                Save & Continue
                            </span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
