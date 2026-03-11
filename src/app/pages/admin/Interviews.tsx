import { useState, useEffect } from "react";
import { ExternalLink, Calendar, Loader2, Users } from "lucide-react";
import { Link } from "react-router";
import { supabase } from "../../lib/supabase";
import { useSettings } from "../../lib/hooks";
import { CAL_BOOKING_URL } from "../../lib/interview-config";

const CAL_ADMIN_URL = "https://app.cal.com";

const labelCls =
    "font-['Geist_Mono',monospace] text-[10px] text-[#6c6c6c] uppercase tracking-[0.08em] block mb-2";

export function AdminInterviews() {
    const { settings, updateSetting } = useSettings();
    const [candidates, setCandidates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const interviewsOpen =
        settings.interview_scheduling_open === true ||
        settings.interview_scheduling_open === "true";

    useEffect(() => {
        supabase
            .from("applications")
            .select(
                "id, status, user_id, profiles(first_name, last_name, email), application_positions(positions(title))",
            )
            .eq("status", "interview_scheduled")
            .order("created_at", { ascending: true })
            .then(({ data, error }) => {
                if (error)
                    console.error(
                        "Failed to fetch interview candidates:",
                        error,
                    );
                setCandidates(data || []);
                setLoading(false);
            });
    }, []);

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="border-b border-[#dbe0ec] pb-7">
                <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.1em] mb-3">
                    Admin â€” 02
                </p>
                <h1
                    className="font-['Source_Serif_4',serif] text-[40px] text-black tracking-[-1.2px]"
                    style={{ lineHeight: 1.05 }}
                >
                    Interview
                    <br />
                    Management
                </h1>
                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-lg tracking-[-0.3px] mt-2">
                    Candidates invited to interview. Scheduling is handled via
                    Cal.com.
                </p>
            </header>

            {/* Interview Scheduling Toggle */}
            <section>
                <div className="border border-[#dbe0ec]">
                    <div className="flex items-center justify-between px-6 py-5">
                        <div className="flex items-start gap-4">
                            <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] w-6 mt-0.5">
                                01
                            </span>
                            <div>
                                <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                    Interview Scheduling
                                </p>
                                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm mt-0.5">
                                    Show the Cal.com booking link on the
                                    applicant Interview page.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() =>
                                updateSetting(
                                    "interview_scheduling_open",
                                    !interviewsOpen,
                                )
                            }
                            className={`relative w-12 h-6 transition-colors shrink-0 ${interviewsOpen ? "bg-black" : "bg-[#dbe0ec]"}`}
                        >
                            <div
                                className={`absolute top-1 w-4 h-4 bg-white transition-all ${interviewsOpen ? "left-7" : "left-1"}`}
                            />
                        </button>
                    </div>
                </div>
            </section>

            {/* Candidate List */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-[#6c6c6c]" />
                        <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                            Interview Candidates
                        </h2>
                    </div>
                    <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                        {loading ? "â€”" : `${candidates.length} invited`}
                    </span>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16 border border-[#dbe0ec]">
                        <Loader2 className="w-5 h-5 animate-spin text-[#6c6c6c]" />
                    </div>
                ) : candidates.length > 0 ? (
                    <div className="border border-[#dbe0ec]">
                        {/* Table header */}
                        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-[#f9f9f7] border-b border-[#dbe0ec]">
                            <div className="col-span-1">
                                <span className={labelCls}>#</span>
                            </div>
                            <div className="col-span-3">
                                <span className={labelCls}>Name</span>
                            </div>
                            <div className="col-span-3">
                                <span className={labelCls}>Email</span>
                            </div>
                            <div className="col-span-4">
                                <span className={labelCls}>Position(s)</span>
                            </div>
                            <div className="col-span-1">
                                <span className={labelCls}>Review</span>
                            </div>
                        </div>
                        {candidates.map((app: any, i: number) => {
                            const profile = app.profiles;
                            const name =
                                `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
                                profile?.email ||
                                "Unknown";
                            const positions =
                                (app.application_positions || [])
                                    .map((ap: any) => ap.positions?.title)
                                    .filter(Boolean)
                                    .join(", ") || "â€”";

                            return (
                                <div
                                    key={app.id}
                                    className={`grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-[#f9f9f7] transition-colors ${
                                        i !== 0
                                            ? "border-t border-[#dbe0ec]"
                                            : ""
                                    }`}
                                >
                                    <div className="col-span-1">
                                        <span className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                                            {String(i + 1).padStart(2, "0")}
                                        </span>
                                    </div>
                                    <div className="col-span-3">
                                        <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                            {name}
                                        </p>
                                    </div>
                                    <div className="col-span-3">
                                        <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm truncate">
                                            {profile?.email || "â€”"}
                                        </p>
                                    </div>
                                    <div className="col-span-4">
                                        <p className="font-['Source_Serif_4',serif] text-black text-sm">
                                            {positions}
                                        </p>
                                    </div>
                                    <div className="col-span-1">
                                        <Link
                                            to={`/admin/applications/${app.id}`}
                                            className="font-['Geist_Mono',monospace] text-[11px] text-black underline underline-offset-2 hover:text-[#6c6c6c] transition-colors"
                                        >
                                            View
                                        </Link>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="border border-[#dbe0ec] bg-white px-6 py-12 text-center">
                        <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm">
                            No applicants have been moved to the interview stage
                            yet.
                        </p>
                    </div>
                )}
            </section>

            {/* Cal.com Links */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-base">
                        Cal.com
                    </h2>
                </div>
                <div className="max-w-lg space-y-4">
                    <div className="border border-[#dbe0ec] p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 border border-[#dbe0ec] flex items-center justify-center shrink-0">
                                <Calendar className="w-5 h-5 text-black" />
                            </div>
                            <div>
                                <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                    Admin Dashboard
                                </p>
                                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm mt-0.5">
                                    Manage availability, view bookings, and
                                    configure the event type.
                                </p>
                            </div>
                        </div>
                        <a
                            href={CAL_ADMIN_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full bg-black flex gap-[10px] items-center justify-center px-5 py-4 hover:bg-zinc-800 transition-colors"
                        >
                            <div className="bg-white shrink-0 w-[5px] h-[5px]" />
                            <span className="font-['Geist_Mono',monospace] text-[13px] text-white whitespace-nowrap leading-none">
                                Open Cal.com Dashboard
                            </span>
                            <ExternalLink className="w-3.5 h-3.5 text-white shrink-0" />
                        </a>
                    </div>

                    <div className="border border-[#dbe0ec] p-5 space-y-2">
                        <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                            Applicant Booking Link
                        </p>
                        <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm">
                            Shown to applicants on their Interview page and sent
                            in their invitation email.
                        </p>
                        <a
                            href={CAL_BOOKING_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 font-['Geist_Mono',monospace] text-[11px] text-black underline underline-offset-2 hover:text-[#6c6c6c] transition-colors break-all"
                        >
                            {CAL_BOOKING_URL}
                            <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                    </div>
                </div>
            </section>
        </div>
    );
}
