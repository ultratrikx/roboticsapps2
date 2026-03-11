import {
    Loader2,
    Calendar,
    AlertCircle,
    Clock,
    ExternalLink,
} from "lucide-react";
import { useAuth } from "../../lib/AuthContext";
import { useApplication, useSettings } from "../../lib/hooks";
import { CAL_BOOKING_URL } from "../../lib/interview-config";

export function ApplicantInterview() {
    const { profile } = useAuth();
    const { application, loading } = useApplication(profile?.id);
    const { settings } = useSettings();
    const interviewsOpen =
        settings.interview_scheduling_open === true ||
        settings.interview_scheduling_open === "true";

    const interviewPositions =
        application?.application_positions?.filter(
            (ap: any) => ap.status === "interview_scheduled",
        ) || [];
    const hasInterviewInvite =
        interviewPositions.length > 0 ||
        application?.status === "interview_scheduled";
    const interviewPositionTitles =
        interviewPositions.length > 0
            ? interviewPositions
                  .map((ap: any) => ap.positions?.title)
                  .filter(Boolean)
            : (application?.application_positions || [])
                  .map((ap: any) => ap.positions?.title)
                  .filter(Boolean);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="w-6 h-6 animate-spin text-[#6c6c6c]" />
            </div>
        );
    }

    // Show no-invite state
    if (!hasInterviewInvite) {
        return (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
                <header className="border-b border-[#dbe0ec] pb-8">
                    <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.1em] mb-3">
                        Step 08
                    </p>
                    <h1
                        className="font-['Source_Serif_4',serif] text-[48px] text-black tracking-[-1.5px]"
                        style={{ lineHeight: 1.05 }}
                    >
                        Schedule
                        <br />
                        Interview
                    </h1>
                    <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-lg tracking-[-0.3px] mt-2">
                        You have not been invited to an interview yet. Check
                        back later!
                    </p>
                </header>
            </div>
        );
    }

    // Show scheduling closed state
    if (!interviewsOpen) {
        return (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
                <header className="border-b border-[#dbe0ec] pb-8">
                    <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.1em] mb-3">
                        Step 08
                    </p>
                    <h1
                        className="font-['Source_Serif_4',serif] text-[48px] text-black tracking-[-1.5px]"
                        style={{ lineHeight: 1.05 }}
                    >
                        Schedule
                        <br />
                        Interview
                    </h1>
                    <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-lg tracking-[-0.3px] mt-2">
                        Interview scheduling is not yet open. You will receive
                        an email with your booking link once scheduling opens.
                    </p>
                </header>
            </div>
        );
    }

    // Show Cal.com booking link
    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
            <header className="border-b border-[#dbe0ec] pb-8">
                <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.1em] mb-3">
                    Step 08
                </p>
                <h1
                    className="font-['Source_Serif_4',serif] text-[48px] text-black tracking-[-1.5px]"
                    style={{ lineHeight: 1.05 }}
                >
                    Schedule
                    <br />
                    Interview
                </h1>
                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-lg tracking-[-0.3px] mt-2">
                    You have been invited to interview for{" "}
                    <span className="text-black">
                        {interviewPositionTitles.join(", ")}
                    </span>
                    .
                </p>
            </header>

            <div className="max-w-lg">
                <div className="border border-[#dbe0ec] p-8 space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 border border-[#dbe0ec] flex items-center justify-center shrink-0">
                            <Calendar className="w-5 h-5 text-black" />
                        </div>
                        <div>
                            <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                                Book Your Interview
                            </p>
                            <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm mt-0.5">
                                Choose a time that works for you using the link
                                below.
                            </p>
                        </div>
                    </div>

                    <a
                        href={CAL_BOOKING_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-black flex gap-[10px] items-center justify-center px-5 py-4 hover:bg-zinc-800 transition-colors"
                    >
                        <div className="bg-white shrink-0 w-[5px] h-[5px]" />
                        <span className="font-['Geist_Mono',monospace] text-[13px] text-white whitespace-nowrap leading-none">
                            Book Interview Slot
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 text-white shrink-0" />
                    </a>

                    <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c]">
                        A confirmation will be sent to your email by Cal.com
                        after booking.
                    </p>
                </div>

                <div className="border border-[#dbe0ec] border-t-0 p-5 space-y-4">
                    <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-black text-sm">
                        Important Details
                    </p>
                    <div className="space-y-3">
                        {[
                            {
                                icon: Clock,
                                text: "Interviews are approximately 15–20 minutes. Please be on time.",
                            },
                            {
                                icon: AlertCircle,
                                text: "To reschedule, use the link in your Cal.com confirmation email, or contact the executive team at least 24 hours in advance.",
                            },
                        ].map(({ icon: Icon, text }, i) => (
                            <div key={i} className="flex gap-3">
                                <Icon className="w-4 h-4 text-[#6c6c6c] shrink-0 mt-0.5" />
                                <p className="font-['Source_Serif_4',serif] text-[#6c6c6c] text-sm leading-[1.4]">
                                    {text}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
