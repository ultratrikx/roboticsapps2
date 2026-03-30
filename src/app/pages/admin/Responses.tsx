import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router";
import { Search, Loader2, MessageSquare, ArrowRight, EyeOff, Eye } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";

interface Question {
  id: string;
  prompt: string;
  type: string;
  position_id: string | null;
  sort_order: number;
  positions: { title: string } | null;
}

interface Response {
  id: string;
  content: string;
  question_id: string;
  application_id: string;
  applications: {
    id: string;
    user_id: string;
    profiles: {
      first_name: string;
      last_name: string;
      email: string;
    } | null;
  } | null;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function AdminResponses() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [hideNames, setHideNames] = useState(true);
  const [responseCounts, setResponseCounts] = useState<Record<string, number>>({});

  // Fetch questions
  useEffect(() => {
    supabase
      .from("questions")
      .select("*, positions(title)")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        const qs = (data || []) as Question[];
        setQuestions(qs);
        setLoadingQuestions(false);

        // Fetch all response question_ids in a single query, count client-side
        if (qs.length > 0) {
          supabase
            .from("responses")
            .select("question_id")
            .then(({ data }) => {
              const map: Record<string, number> = {};
              for (const r of data || []) {
                map[r.question_id] = (map[r.question_id] || 0) + 1;
              }
              setResponseCounts(map);
            });
        }
      });
  }, []);

  // Fetch responses when a question is selected
  useEffect(() => {
    if (!selectedQuestionId) {
      setResponses([]);
      return;
    }
    setLoadingResponses(true);
    supabase
      .from("responses")
      .select("*, applications(id, user_id, profiles(first_name, last_name, email))")
      .eq("question_id", selectedQuestionId)
      .then(({ data }) => {
        setResponses((data || []) as Response[]);
        setLoadingResponses(false);
      });
  }, [selectedQuestionId]);

  // Group questions
  const generalQuestions = useMemo(() => questions.filter((q) => !q.position_id), [questions]);
  const positionGroups = useMemo(() => {
    const groups: Record<string, { title: string; questions: Question[] }> = {};
    for (const q of questions) {
      if (q.position_id) {
        if (!groups[q.position_id]) {
          groups[q.position_id] = {
            title: q.positions?.title || "Unknown Position",
            questions: [],
          };
        }
        groups[q.position_id].questions.push(q);
      }
    }
    return groups;
  }, [questions]);

  // Filter responses by search
  const filteredResponses = useMemo(() => {
    if (!searchTerm.trim()) return responses;
    const term = searchTerm.toLowerCase();
    return responses.filter((r) => {
      const name = `${r.applications?.profiles?.first_name || ""} ${r.applications?.profiles?.last_name || ""}`.trim().toLowerCase();
      const email = (r.applications?.profiles?.email || "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [responses, searchTerm]);

  const selectedQuestion = questions.find((q) => q.id === selectedQuestionId);

  if (loadingQuestions) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#6c6c6c]" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="border-b border-[#dbe0ec] pb-7">
        <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.1em] mb-3">Admin — Responses</p>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-['Source_Serif_4',serif] text-[40px] text-black tracking-[-1.2px]" style={{ lineHeight: 1.05 }}>
              Applicant<br />Responses
            </h1>
            <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-lg tracking-[-0.3px] mt-2">
              Compare all applicant responses to a question side-by-side.
            </p>
          </div>
          <div className="flex items-center gap-3 mb-1">
            <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] border border-[#dbe0ec] px-2.5 py-1">
              {questions.length} questions
            </span>
          </div>
        </div>
      </header>

      <div className="flex gap-6 min-h-[60vh]">
        {/* Sidebar — Question Selector */}
        <div className="w-80 shrink-0 border border-[#dbe0ec] bg-white self-start">
          <div className="px-4 py-3 border-b border-[#dbe0ec] bg-[#f9f9f7]">
            <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em]">
              Select a Question
            </span>
          </div>

          {/* General Questions */}
          {generalQuestions.length > 0 && (
            <div>
              <div className="px-4 py-2 border-b border-[#dbe0ec] bg-[#f9f9f7]">
                <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em]">
                  General
                </span>
              </div>
              {generalQuestions.map((q) => (
                <button
                  key={q.id}
                  onClick={() => setSelectedQuestionId(q.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b border-[#dbe0ec] transition-colors",
                    selectedQuestionId === q.id
                      ? "bg-black text-white"
                      : "bg-white text-black hover:bg-[#f9f9f7]"
                  )}
                >
                  <p
                    className={cn(
                      "font-['Radio_Canada_Big',sans-serif] text-sm leading-snug line-clamp-2",
                      selectedQuestionId === q.id ? "text-white" : "text-black"
                    )}
                  >
                    {q.prompt}
                  </p>
                  <span
                    className={cn(
                      "font-['Geist_Mono',monospace] text-[10px] mt-1 inline-block",
                      selectedQuestionId === q.id ? "text-white/60" : "text-[#6c6c6c]"
                    )}
                  >
                    {responseCounts[q.id] ?? "..."} responses
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Position-specific Questions */}
          {Object.entries(positionGroups).map(([posId, group]) => (
            <div key={posId}>
              <div className="px-4 py-2 border-b border-[#dbe0ec] bg-[#f9f9f7]">
                <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em]">
                  {group.title}
                </span>
              </div>
              {group.questions.map((q) => (
                <button
                  key={q.id}
                  onClick={() => setSelectedQuestionId(q.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b border-[#dbe0ec] transition-colors",
                    selectedQuestionId === q.id
                      ? "bg-black text-white"
                      : "bg-white text-black hover:bg-[#f9f9f7]"
                  )}
                >
                  <p
                    className={cn(
                      "font-['Radio_Canada_Big',sans-serif] text-sm leading-snug line-clamp-2",
                      selectedQuestionId === q.id ? "text-white" : "text-black"
                    )}
                  >
                    {q.prompt}
                  </p>
                  <span
                    className={cn(
                      "font-['Geist_Mono',monospace] text-[10px] mt-1 inline-block",
                      selectedQuestionId === q.id ? "text-white/60" : "text-[#6c6c6c]"
                    )}
                  >
                    {responseCounts[q.id] ?? "..."} responses
                  </span>
                </button>
              ))}
            </div>
          ))}

          {questions.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm">
                No active questions found.
              </p>
            </div>
          )}
        </div>

        {/* Main Content — Response Grid */}
        <div className="flex-1 min-w-0">
          {!selectedQuestionId ? (
            <div className="border border-dashed border-[#dbe0ec] p-16 flex flex-col items-center text-center h-full justify-center">
              <MessageSquare className="w-8 h-8 text-[#6c6c6c] mb-4" />
              <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-lg mb-2">
                Select a Question
              </p>
              <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-base max-w-sm">
                Choose a question from the sidebar to view and compare all applicant responses side-by-side.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Question header */}
              <div className="border border-[#dbe0ec] bg-[#f9f9f7] px-5 py-4">
                <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em] block mb-2">
                  {selectedQuestion?.position_id
                    ? selectedQuestion.positions?.title || "Position-Specific"
                    : "General Question"}
                </span>
                <p className="font-['Radio_Canada_Big',sans-serif] text-black text-base font-medium">
                  {selectedQuestion?.prompt}
                </p>
              </div>

              {/* Search and count bar */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6c6c6c]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter by applicant name..."
                    className="w-full border border-[#dbe0ec] bg-white pl-10 pr-4 py-2.5 font-['Radio_Canada_Big',sans-serif] text-sm text-black outline-none focus:border-black transition-colors placeholder-[#6c6c6c]"
                  />
                </div>
                <label className="inline-flex items-center gap-2 border border-[#dbe0ec] px-2.5 py-2 shrink-0 cursor-pointer select-none hover:bg-[#f9f9f7] transition-colors">
                  <input
                    type="checkbox"
                    checked={hideNames}
                    onChange={(e) => setHideNames(e.target.checked)}
                    className="accent-black w-3.5 h-3.5 cursor-pointer"
                  />
                  {hideNames ? (
                    <EyeOff className="w-3.5 h-3.5 text-[#6c6c6c]" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-[#6c6c6c]" />
                  )}
                  <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                    Hide names
                  </span>
                </label>
                <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] border border-[#dbe0ec] px-2.5 py-2 shrink-0">
                  {filteredResponses.length} of {responses.length} responses
                </span>
              </div>

              {/* Responses */}
              {loadingResponses ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 animate-spin text-[#6c6c6c]" />
                </div>
              ) : filteredResponses.length === 0 ? (
                <div className="border border-dashed border-[#dbe0ec] p-12 text-center">
                  <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-base">
                    {responses.length === 0
                      ? "No responses have been submitted for this question yet."
                      : "No responses match your search filter."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredResponses.map((r, index) => {
                    const firstName = r.applications?.profiles?.first_name || "";
                    const lastName = r.applications?.profiles?.last_name || "";
                    const fullName = `${firstName} ${lastName}`.trim() || "Unknown Applicant";
                    const email = r.applications?.profiles?.email || "";
                    const words = wordCount(r.content || "");

                    return (
                      <div
                        key={r.id}
                        className="border border-[#dbe0ec] bg-white flex flex-col"
                      >
                        {/* Card header */}
                        <div className="px-5 py-3 border-b border-[#dbe0ec] flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-['Radio_Canada_Big',sans-serif] text-sm font-medium text-black truncate">
                              {hideNames ? `Applicant ${index + 1}` : fullName}
                            </p>
                            {!hideNames && (
                              <p className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] truncate">
                                {email}
                              </p>
                            )}
                          </div>
                          <span className="font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] border border-[#dbe0ec] px-2 py-0.5 shrink-0">
                            {words} {words === 1 ? "word" : "words"}
                          </span>
                        </div>

                        {/* Response content */}
                        <div className="px-5 py-4 flex-1">
                          <p className="font-['Source_Serif_4',serif] text-sm text-black leading-relaxed whitespace-pre-wrap">
                            {r.content}
                          </p>
                        </div>

                        {/* Card footer */}
                        {!hideNames && (
                          <div className="px-5 py-3 border-t border-[#dbe0ec] bg-[#f9f9f7]">
                            <Link
                              to={`/admin/applications/${r.application_id}`}
                              className="inline-flex items-center gap-1.5 font-['Geist_Mono',monospace] text-[11px] text-black hover:underline transition-colors"
                            >
                              View Application
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
