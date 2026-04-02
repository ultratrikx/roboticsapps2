import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, PenTool, Loader2, CheckCircle2, Circle, ChevronLeft, ChevronRight, ListOrdered } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, format, parseISO, isToday,
  addMonths, subMonths,
} from "date-fns";
import { useAuth } from "../../lib/AuthContext";
import { useApplication, useSettings } from "../../lib/hooks";
import { useDataContext } from "../../lib/DataContext";
import { STATUS_LABELS } from "../../data";
import { cn } from "../../lib/utils";

function PrimaryButton({ to, children, className }: { to?: string; children: React.ReactNode; className?: string }) {
  const cls = cn(
    "bg-black flex gap-[10px] items-center justify-center px-5 py-3.5 hover:bg-zinc-800 transition-colors",
    className
  );
  if (to) {
    return (
      <Link to={to} className={cls}>
        <div className="bg-white shrink-0 w-[5px] h-[5px]" />
        <span className="font-['Geist_Mono',monospace] text-[13px] text-white whitespace-nowrap leading-none">{children}</span>
      </Link>
    );
  }
  return (
    <button className={cls}>
      <div className="bg-white shrink-0 w-[5px] h-[5px]" />
      <span className="font-['Geist_Mono',monospace] text-[13px] text-white whitespace-nowrap leading-none">{children}</span>
    </button>
  );
}

export function ApplicantDashboard() {
  const { profile } = useAuth();
  const { application, loading } = useApplication(profile?.id);
  const { settings } = useSettings();
  const navigate = useNavigate();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const firstName = profile?.first_name || "there";

  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const { progressCounts } = useDataContext();

  const appPositions = application?.application_positions || [];

  const [showRankingNotice, setShowRankingNotice] = useState(false);

  useEffect(() => {
    if (appPositions.length > 0 && !localStorage.getItem("ranking_notice_dismissed")) {
      setShowRankingNotice(true);
    }
  }, [appPositions.length]);

  const dismissRankingNotice = () => {
    localStorage.setItem("ranking_notice_dismissed", "true");
    setShowRankingNotice(false);
  };

  const sections = [
    {
      key: "profile",
      label: "Profile",
      path: "/applicant/profile",
      complete: !!(profile?.first_name && profile?.last_name && profile?.grade),
    },
    {
      key: "positions",
      label: "Positions",
      path: "/applicant/positions",
      complete: appPositions.length > 0,
    },
    {
      key: "activities",
      label: "Activities",
      path: "/applicant/activities",
      complete: progressCounts.activities > 0,
    },
    {
      key: "responses",
      label: "Responses",
      path: "/applicant/responses",
      complete: progressCounts.responses > 0,
    },
    {
      key: "honors",
      label: "Honors",
      path: "/applicant/honors",
      complete: progressCounts.honors > 0,
    },
    {
      key: "review",
      label: "Review",
      path: "/applicant/review",
      complete: !!application && application.status !== "draft",
    },
  ];

  const completedCount = sections.filter((s) => s.complete).length;
  const totalSections = sections.length;
  const progressPercent = totalSections > 0 ? (completedCount / totalSections) * 100 : 0;

  const submittedPositionCount = application?.status !== "draft" ? appPositions.length : 0;
  const positionProgressPercent = appPositions.length > 0 ? (submittedPositionCount / appPositions.length) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#6c6c6c]" />
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Ranking Feature Notification */}
      <Dialog open={showRankingNotice} onOpenChange={(open) => { if (!open) dismissRankingNotice(); }}>
        <DialogContent className="sm:max-w-md bg-white border border-[#dbe0ec] rounded-none p-0 gap-0">
          <div className="px-6 pt-6 pb-4">
            <DialogHeader className="gap-0">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-black flex items-center justify-center">
                  <ListOrdered className="w-4 h-4 text-white" />
                </div>
                <DialogTitle className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base leading-tight">
                  New: Rank Your Positions
                </DialogTitle>
              </div>
              <DialogDescription asChild>
                <div className="space-y-3">
                  <p className="font-['Source_Serif_4',serif] text-[#333] text-[15px] leading-relaxed">
                    You can now <span className="font-semibold text-black">rank your selected positions in order of preference</span>. This is an important step — we'll prioritize your <span className="font-semibold text-black">top 2 choices</span> during the review process, though positions ranked below will still be considered.
                  </p>
                  <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm leading-relaxed">
                    Head to the Positions page to drag and reorder your selections. Make sure your most desired roles are at the top.
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
          </div>
          <DialogFooter className="border-t border-[#dbe0ec] px-6 py-4 flex-row sm:justify-between gap-3">
            <button
              onClick={dismissRankingNotice}
              className="font-['Geist_Mono',monospace] text-[12px] text-[#6c6c6c] hover:text-black transition-colors"
            >
              Dismiss
            </button>
            <Link
              to="/applicant/positions"
              onClick={dismissRankingNotice}
              className="bg-black flex gap-[10px] items-center justify-center px-5 py-3 hover:bg-zinc-800 transition-colors"
            >
              <div className="bg-white shrink-0 w-[5px] h-[5px]" />
              <span className="font-['Geist_Mono',monospace] text-[12px] text-white whitespace-nowrap leading-none">
                Rank My Positions
              </span>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="border-b border-[#dbe0ec] pb-8">
        <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.1em] mb-3">
          Overview
        </p>
        <h1
          className="font-['Source_Serif_4',serif] text-[48px] text-black tracking-[-1.5px]"
          style={{ lineHeight: 1.05 }}
        >
          {getGreeting()},<br />{firstName}.
        </h1>
        <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-lg tracking-[-0.3px] mt-2">
          Here's a summary of your application progress.
        </p>
      </header>

      {/* My Application - Section Checklist */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
            My Application
          </h2>
          <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
            {completedCount}/{totalSections} sections complete
          </span>
        </div>

        <div className="border border-[#dbe0ec] bg-white">
          {/* Progress bar */}
          <div className="px-6 pt-6 pb-4">
            <div className="grid grid-cols-6 gap-1">
              {sections.map((section) => (
                <div key={section.key} className="h-[6px] bg-[#eaeaea]">
                  {section.complete && (
                    <motion.div
                      className="h-full bg-black"
                      initial={{ width: 0 }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Horizontal section checklist */}
          <div className="px-6 pb-6">
            <div className="grid grid-cols-6 gap-2">
              {sections.map((section, i) => (
                <motion.div
                  key={section.key}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    to={section.path}
                    className="flex flex-col items-center gap-2 py-3 px-2 rounded hover:bg-[#f9f9f7] transition-colors group"
                  >
                    {section.complete ? (
                      <CheckCircle2 className="w-5 h-5 text-black" />
                    ) : (
                      <Circle className="w-5 h-5 text-[#d0d0d0]" />
                    )}
                    <span
                      className={cn(
                        "font-['Geist_Mono',monospace] text-[11px] text-center leading-tight group-hover:underline",
                        section.complete ? "text-black" : "text-[#6c6c6c]"
                      )}
                    >
                      {section.label}
                    </span>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* My Positions */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
            My Positions
          </h2>
          <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
            {appPositions.length} position{appPositions.length !== 1 ? "s" : ""} on my list
          </span>
        </div>

        <div className="border border-[#dbe0ec]">
          {appPositions.length > 0 && (
            <>
              {/* Position submission progress */}
              <div className="px-6 pt-5 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm">
                    {submittedPositionCount}/{appPositions.length} submitted
                  </span>
                </div>
                <div className="w-full h-[4px] bg-[#eaeaea] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-black rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${positionProgressPercent}%` }}
                    transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
                  />
                </div>
              </div>

              {/* Position list */}
              {appPositions.map((ap: any, i: number) => (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  key={ap.id}
                  className={cn(
                    "flex items-center justify-between px-6 py-5 hover:bg-[#f9f9f7] transition-colors group border-t border-[#dbe0ec]"
                  )}
                >
                  <div className="flex items-center gap-5">
                    <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] w-6">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm group-hover:underline">
                        {ap.positions?.title}
                      </h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {application?.status !== "draft" && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-black" />
                    )}
                    <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] border border-[#dbe0ec] px-2.5 py-1">
                      {STATUS_LABELS[ap.status] ?? ap.status}
                    </span>
                  </div>
                </motion.div>
              ))}

              <div className="px-6 py-4 border-t border-[#dbe0ec] flex items-center justify-end">
                {application?.status === "draft" ? (
                  <Link
                    to="/applicant/review"
                    className="font-['Geist_Mono',monospace] text-[11px] text-black flex items-center gap-1 hover:underline"
                  >
                    Review & Submit <ArrowRight className="w-3 h-3" />
                  </Link>
                ) : (
                  <Link
                    to="/applicant/review"
                    className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] flex items-center gap-1 hover:underline"
                  >
                    View Application <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </>
          )}

          {appPositions.length === 0 && (
            <div className="px-6 py-16 text-center">
              <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-base mb-6">
                You haven't added any positions yet.
              </p>
              <PrimaryButton to="/applicant/positions">Browse Positions</PrimaryButton>
            </div>
          )}
        </div>
      </section>

      {/* Key Dates */}
      <section>
        <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base mb-2">
          Key Dates
        </h2>
        {(() => {
          const formatDateDisplay = (raw: string): string => {
            try {
              const d = parseISO(raw);
              if (!isNaN(d.getTime())) return format(d, "MMMM d, yyyy");
            } catch { /* fall through */ }
            return raw;
          };

          const keyDates = [
            { raw: settings.application_deadline || "TBD", label: "Application Deadline", desc: "Submit all materials for the 2026-2027 cycle.", type: "deadline" as const },
            { raw: settings.interview_window || "TBD", label: "Interview Window", desc: "If selected, you will be invited to book a slot.", type: "interview" as const },
            { raw: settings.decisions_date || "TBD", label: "Decisions Released", desc: "Check your portal for updates.", type: "decision" as const },
          ].map((kd) => ({ ...kd, display: kd.raw === "TBD" ? "TBD" : formatDateDisplay(kd.raw) }));

          const tryParse = (s: string): Date | null => {
            try {
              const d = parseISO(s);
              return isNaN(d.getTime()) ? null : d;
            } catch {
              return null;
            }
          };

          const parsedDates = keyDates.map((kd) => ({ ...kd, parsed: tryParse(kd.raw) }));

          const monthStart = startOfMonth(calendarMonth);
          const monthEnd = endOfMonth(calendarMonth);
          const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
          const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
          const days = eachDayOfInterval({ start: calStart, end: calEnd });
          const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

          return (
            <div className="border border-[#dbe0ec]">
              {/* Calendar */}
              <div className="px-6 pt-5 pb-4">
                {/* Month nav */}
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => setCalendarMonth((m) => subMonths(m, 1))}
                    className="text-[#6c6c6c] hover:text-black transition-colors p-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                    {format(calendarMonth, "MMMM yyyy")}
                  </span>
                  <button
                    onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
                    className="text-[#6c6c6c] hover:text-black transition-colors p-1"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 mb-1">
                  {dayHeaders.map((dh) => (
                    <div key={dh} className="text-center font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.06em] py-1">
                      {dh}
                    </div>
                  ))}
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7">
                  {days.map((day) => {
                    const inMonth = isSameMonth(day, calendarMonth);
                    const today = isToday(day);
                    const matchingDates = parsedDates.filter((pd) => pd.parsed && isSameDay(day, pd.parsed));
                    const isInterviewDay = matchingDates.some((m) => m.type === "interview");
                    const isDeadlineDay = matchingDates.some((m) => m.type === "deadline");
                    const isDecisionDay = matchingDates.some((m) => m.type === "decision");
                    const tooltipLabel = matchingDates.map((m) => m.label).join(", ");

                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          "w-full aspect-square flex flex-col items-center justify-center text-[13px] font-['Geist_Mono',monospace] relative",
                          !inMonth && "text-[#d0d0d0]",
                          inMonth && "text-black",
                          today && "border border-black",
                          isDeadlineDay && inMonth && "bg-black text-white",
                          isDecisionDay && inMonth && "bg-[#333] text-white",
                          isInterviewDay && inMonth && "bg-[#e8e8e8] border-l-2 border-l-black"
                        )}
                        title={tooltipLabel || undefined}
                      >
                        <span>{format(day, "d")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Legend */}
              <div className="border-t border-[#dbe0ec]">
                {parsedDates.map((item, i) => (
                  <div
                    key={item.label}
                    className={cn(
                      "px-6 py-3 flex items-start gap-3",
                      i !== 0 && "border-t border-[#dbe0ec]"
                    )}
                  >
                    <div className="mt-1.5 shrink-0">
                      {item.type === "deadline" ? (
                        <span className="block w-[10px] h-[10px] bg-black" />
                      ) : item.type === "decision" ? (
                        <span className="block w-[10px] h-[10px] bg-[#333]" />
                      ) : (
                        <span className="block w-[10px] h-[10px] bg-[#e8e8e8] border-l-2 border-l-black border border-[#d0d0d0]" />
                      )}
                    </div>
                    <div>
                      <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] mb-0.5">{item.display}</p>
                      <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">{item.label}</p>
                      <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </section>
    </div>
  );
}
