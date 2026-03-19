import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical, Loader2 } from "lucide-react";
import { Reorder } from "motion/react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { usePositions, useSettings } from "../../lib/hooks";
import { cn } from "../../lib/utils";

const fieldCls =
  "w-full border border-[#dbe0ec] bg-white px-4 py-3 font-['Radio_Canada_Big',sans-serif] text-sm text-black outline-none focus:border-black transition-colors placeholder-[#6c6c6c]";

const selectCls =
  "w-full border border-[#dbe0ec] bg-white px-4 py-3 font-['Radio_Canada_Big',sans-serif] text-sm text-black outline-none focus:border-black transition-colors";

const labelCls =
  "font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em] block mb-2";

const QUESTION_TYPES = [
  { value: "textarea", label: "Long Text" },
  { value: "short_text", label: "Short Text" },
  { value: "select", label: "Dropdown Select" },
  { value: "checkbox", label: "Checkboxes" },
  { value: "number", label: "Number" },
];

interface Question {
  id: string;
  prompt: string;
  description: string;
  type: string;
  options: string[] | null;
  char_limit: number;
  limit_mode: "characters" | "words";
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  position_id: string | null;
  expanded: boolean;
}

type TabId = "all" | "general" | string;

export function AdminQuestions() {
  const { positions } = usePositions();
  const { settings } = useSettings();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("all");

  const defaultLimitMode: "characters" | "words" = settings.limit_mode === "words" ? "words" : "characters";

  useEffect(() => {
    supabase
      .from("questions")
      .select("*")
      .order("sort_order")
      .then(({ data }) => {
        setQuestions((data || []).map((q: any) => ({ ...q, limit_mode: q.limit_mode || "characters", expanded: false })));
        setLoading(false);
      });
  }, []);

  const filteredQuestions = questions.filter((q) => {
    if (activeTab === "all") return true;
    if (activeTab === "general") return !q.position_id;
    return q.position_id === activeTab;
  });

  const addQuestion = () => {
    const newQ: Question = {
      id: crypto.randomUUID(),
      prompt: "",
      description: "",
      type: "textarea",
      options: null,
      char_limit: defaultLimitMode === "words" ? 500 : 2000,
      limit_mode: defaultLimitMode,
      is_required: true,
      is_active: true,
      sort_order: questions.length,
      position_id: activeTab === "general" ? null : activeTab === "all" ? null : activeTab,
      expanded: true,
    };
    setQuestions([...questions, newQ]);
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const toggleExpand = (id: string) => {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, expanded: !q.expanded } : q)));
  };

  const updateField = (id: string, field: string, value: any) => {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, [field]: value } : q)));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const errors: string[] = [];

    const { data: existing } = await supabase.from("questions").select("id");
    const existingIds = new Set((existing || []).map((q: any) => q.id));
    const currentIds = new Set(questions.map((q) => q.id));

    for (const eq of existing || []) {
      if (!currentIds.has(eq.id)) {
        const { error: err } = await supabase.from("questions").delete().eq("id", eq.id);
        if (err) errors.push(`Delete failed: ${err.message}`);
      }
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const row = {
        id: q.id,
        prompt: q.prompt,
        description: q.description,
        type: q.type,
        options: q.options,
        char_limit: q.char_limit,
        limit_mode: q.limit_mode,
        is_required: q.is_required,
        is_active: q.is_active,
        sort_order: i,
        position_id: q.position_id || null,
        updated_at: new Date().toISOString(),
      };

      if (existingIds.has(q.id)) {
        const { error: err } = await supabase.from("questions").update(row).eq("id", q.id);
        if (err) errors.push(`Update "${q.prompt || "untitled"}" failed: ${err.message}`);
      } else {
        const { error: err } = await supabase.from("questions").insert(row);
        if (err) errors.push(`Insert "${q.prompt || "untitled"}" failed: ${err.message}`);
      }
    }

    if (errors.length > 0) {
      setError(errors.join(" | "));
    } else {
      toast.success("Questions saved");
    }
    setSaving(false);
  };

  const generalCount = questions.filter((q) => !q.position_id).length;
  const positionCounts: Record<string, number> = {};
  for (const q of questions) {
    if (q.position_id) {
      positionCounts[q.position_id] = (positionCounts[q.position_id] || 0) + 1;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#6c6c6c]" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="border-b border-[#dbe0ec] pb-7">
        <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.1em] mb-3">Admin — 04</p>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-['Source_Serif_4',serif] text-[40px] text-black tracking-[-1.2px]" style={{ lineHeight: 1.05 }}>
              Application<br />Questions
            </h1>
            <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-lg tracking-[-0.3px] mt-2">
              Manage general and position-specific questions for applicants.
            </p>
          </div>
          <div className="flex items-center gap-3 mb-1">
            <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] border border-[#dbe0ec] px-2.5 py-1">
              {questions.length} total
            </span>
            <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] border border-[#dbe0ec] px-2.5 py-1">
              Per-question limits
            </span>
          </div>
        </div>
      </header>

      {error && (
        <div className="border border-red-300 bg-red-50 px-5 py-4 flex items-start justify-between gap-4">
          <p className="font-['Radio_Canada_Big',sans-serif] text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="font-['Geist_Mono',monospace] text-[11px] text-red-500 hover:text-red-700 shrink-0">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab("all")}
          className={cn("px-4 py-2 font-['Geist_Mono',monospace] text-[12px] border transition-colors", activeTab === "all" ? "bg-black text-white border-black" : "bg-white text-black border-[#dbe0ec] hover:border-black")}
        >
          All ({questions.length})
        </button>
        <button
          onClick={() => setActiveTab("general")}
          className={cn("px-4 py-2 font-['Geist_Mono',monospace] text-[12px] border transition-colors", activeTab === "general" ? "bg-black text-white border-black" : "bg-white text-black border-[#dbe0ec] hover:border-black")}
        >
          General ({generalCount})
        </button>
        {positions.map((p: any) => (
          <button
            key={p.id}
            onClick={() => setActiveTab(p.id)}
            className={cn("px-4 py-2 font-['Geist_Mono',monospace] text-[12px] border transition-colors", activeTab === p.id ? "bg-black text-white border-black" : "bg-white text-black border-[#dbe0ec] hover:border-black")}
          >
            {p.title} ({positionCounts[p.id] || 0})
          </button>
        ))}
      </div>

      <div className="border border-[#dbe0ec] bg-[#f9f9f7] px-5 py-3">
        <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm">
          {activeTab === "all" && "Showing all questions. Use tabs above to filter by scope."}
          {activeTab === "general" && "General questions are answered by all applicants regardless of which position they apply for."}
          {activeTab !== "all" && activeTab !== "general" && (
            <>Questions specific to <strong className="text-black">{positions.find((p: any) => p.id === activeTab)?.title}</strong>. Only applicants for this position will see these.</>
          )}
        </p>
      </div>

      {filteredQuestions.length === 0 ? (
        <div className="border border-dashed border-[#dbe0ec] p-16 flex flex-col items-center text-center">
          <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-lg mb-2">
            {activeTab === "all" ? "No Questions Yet" : activeTab === "general" ? "No General Questions" : "No Position-Specific Questions"}
          </p>
          <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-base mb-6 max-w-sm">
            {activeTab === "general"
              ? "Add questions that all applicants will answer regardless of position."
              : activeTab !== "all"
              ? `Add questions specific to ${positions.find((p: any) => p.id === activeTab)?.title || "this position"}.`
              : "Add questions that applicants will answer as part of their executive application."}
          </p>
          <button onClick={addQuestion} className="bg-black flex gap-[10px] items-center justify-center px-5 py-3.5 hover:bg-zinc-800 transition-colors">
            <div className="bg-white shrink-0 w-[5px] h-[5px]" />
            <span className="font-['Geist_Mono',monospace] text-[13px] text-white whitespace-nowrap leading-none">Add First Question</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <Reorder.Group axis="y" values={filteredQuestions} onReorder={(newOrder) => {
            const filteredIds = new Set(filteredQuestions.map(q => q.id));
            const otherQuestions = questions.filter(q => !filteredIds.has(q.id));
            setQuestions([...otherQuestions, ...newOrder]);
          }} className="space-y-3">
            {filteredQuestions.map((q, idx) => (
              <Reorder.Item key={q.id} value={q} className="border border-[#dbe0ec] bg-white overflow-hidden">
                <div className="flex">
                  <div className="bg-[#f9f9f7] w-10 flex items-center justify-center border-r border-[#dbe0ec] cursor-grab active:cursor-grabbing hover:bg-[#f0f0ee] transition-colors">
                    <GripVertical className="w-4 h-4 text-[#6c6c6c]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="px-5 py-4 flex justify-between items-center cursor-pointer hover:bg-[#f9f9f7] transition-colors" onClick={() => toggleExpand(q.id)}>
                      <div className="flex items-center gap-4 flex-1 min-w-0 pr-4">
                        <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] shrink-0">{String(idx + 1).padStart(2, "0")}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em]">
                              {QUESTION_TYPES.find((t) => t.value === q.type)?.label || q.type}
                            </span>
                            <span className={cn("font-['Geist_Mono',monospace] text-[10px] border px-1.5 py-0.5", q.position_id ? "text-black border-black" : "text-[#6c6c6c] border-[#dbe0ec]")}>
                              {q.position_id ? positions.find((p: any) => p.id === q.position_id)?.title || "Position" : "General"}
                            </span>
                            {!q.is_active && <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] border border-[#dbe0ec] px-1.5 py-0.5">Inactive</span>}
                            {q.is_required && <span className="font-['Geist_Mono',monospace] text-[10px] text-black">Required</span>}
                          </div>
                          <h4 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm truncate">{q.prompt || "(No prompt set)"}</h4>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button className="p-1.5 text-[#6c6c6c] hover:text-black transition-colors" onClick={(e) => { e.stopPropagation(); removeQuestion(q.id); }}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="p-1.5 text-[#6c6c6c]">
                          {q.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {q.expanded && (
                      <div className="px-5 pb-5 pt-4 border-t border-[#dbe0ec] bg-[#f9f9f7] space-y-5">
                        <div>
                          <label className={labelCls}>Question Prompt</label>
                          <textarea className={fieldCls + " h-20 resize-none"} value={q.prompt} onChange={(e) => updateField(q.id, "prompt", e.target.value)} placeholder="e.g. Why are you interested in this executive position?" />
                        </div>
                        <div>
                          <label className={labelCls}>Description / Help Text (optional)</label>
                          <input className={fieldCls} value={q.description} onChange={(e) => updateField(q.id, "description", e.target.value)} placeholder="e.g. Tell us what motivates you..." />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                          <div>
                            <label className={labelCls}>Question Type</label>
                            <select className={selectCls} value={q.type} onChange={(e) => updateField(q.id, "type", e.target.value)}>
                              {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>
                              {q.limit_mode === "words" ? "Word" : "Character"} Limit
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                inputMode="numeric"
                                className={fieldCls}
                                value={q.char_limit}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/\D/g, "");
                                  updateField(q.id, "char_limit", parseInt(val) || 0);
                                }}
                              />
                              <div className="flex border border-[#dbe0ec] shrink-0">
                                {(["characters", "words"] as const).map((mode) => (
                                  <button
                                    key={mode}
                                    type="button"
                                    onClick={() => updateField(q.id, "limit_mode", mode)}
                                    className={cn(
                                      "px-2.5 py-2 font-['Geist_Mono',monospace] text-[10px] transition-colors border-r last:border-r-0 border-[#dbe0ec]",
                                      q.limit_mode === mode
                                        ? "bg-black text-white"
                                        : "text-[#6c6c6c] hover:text-black"
                                    )}
                                  >
                                    {mode === "characters" ? "Chars" : "Words"}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div>
                            <label className={labelCls}>Position Scope</label>
                            <select className={selectCls} value={q.position_id || ""} onChange={(e) => updateField(q.id, "position_id", e.target.value || null)}>
                              <option value="">General (All Positions)</option>
                              {positions.map((p: any) => <option key={p.id} value={p.id}>{p.title} — Specific</option>)}
                            </select>
                          </div>
                        </div>

                        {(q.type === "select" || q.type === "checkbox") && (
                          <div>
                            <label className={labelCls}>Options (one per line)</label>
                            <textarea className={fieldCls + " h-24 resize-none"} value={(q.options || []).join("\n")} onChange={(e) => updateField(q.id, "options", e.target.value.split("\n").filter(Boolean))} placeholder={"Option A\nOption B\nOption C"} />
                          </div>
                        )}

                        <div className="flex items-center gap-6 pt-2 border-t border-[#dbe0ec]">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="w-4 h-4" checked={q.is_required} onChange={(e) => updateField(q.id, "is_required", e.target.checked)} />
                            <span className="font-['Radio_Canada_Big',sans-serif] text-sm text-black">Required</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="w-4 h-4" checked={q.is_active} onChange={(e) => updateField(q.id, "is_active", e.target.checked)} />
                            <span className="font-['Radio_Canada_Big',sans-serif] text-sm text-black">Active</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>

          <button onClick={addQuestion} className="w-full border border-dashed border-[#dbe0ec] py-4 flex items-center justify-center gap-2 hover:border-black transition-colors">
            <Plus className="w-4 h-4 text-[#6c6c6c]" />
            <span className="font-['Geist_Mono',monospace] text-[12px] text-[#6c6c6c]">
              Add {activeTab === "general" ? "General" : activeTab !== "all" ? "Position-Specific" : ""} Question
            </span>
          </button>
        </div>
      )}

      <div className="flex justify-end pt-4 border-t border-[#dbe0ec]">
        <button onClick={handleSave} disabled={saving} className="bg-black flex gap-[10px] items-center justify-center px-5 py-3.5 hover:bg-zinc-800 transition-colors disabled:opacity-50">
          {saving ? (
            <Loader2 className="w-4 h-4 text-white animate-spin" />
          ) : (
            <>
              <div className="bg-white shrink-0 w-[5px] h-[5px]" />
              <span className="font-['Geist_Mono',monospace] text-[13px] text-white whitespace-nowrap leading-none">Save All Questions</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
