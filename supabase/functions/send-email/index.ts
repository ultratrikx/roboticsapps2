import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL =
    Deno.env.get("FROM_EMAIL") || "WOSS Robotics <tech@wossrobotics.ca>";
const SITE_URL =
    Deno.env.get("SITE_URL") || "https://applications.wossrobotics.ca";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Verify the request is authenticated
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: "Missing authorization" }),
                {
                    status: 401,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        const token = authHeader.replace("Bearer ", "");
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { to, subject, html } = await req.json();

        if (!to || !subject || !html) {
            return new Response(
                JSON.stringify({
                    error: "Missing required fields: to, subject, html",
                }),
                {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        // Check if user is admin
        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();

        const recipients = Array.isArray(to) ? to : [to];
        const normalizedRecipients = recipients
            .map((recipient) => String(recipient).trim().toLowerCase())
            .filter(Boolean);
        const userEmail = user.email?.trim().toLowerCase();
        const isSelfOnlyEmail =
            Boolean(userEmail) &&
            normalizedRecipients.length > 0 &&
            normalizedRecipients.every((recipient) => recipient === userEmail);

        if (profile?.role !== "admin" && !isSelfOnlyEmail) {
            return new Response(
                JSON.stringify({
                    error: "Admin access required unless sending to your own email",
                }),
                {
                    status: 403,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        if (normalizedRecipients.length === 0) {
            return new Response(
                JSON.stringify({
                    error: "At least one valid recipient is required",
                }),
                {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        if (!RESEND_API_KEY) {
            // Fallback: log the email if no API key configured
            console.log(`[EMAIL] To: ${to}, Subject: ${subject}`);
            return new Response(
                JSON.stringify({
                    message: "Email logged (no RESEND_API_KEY configured)",
                    id: "dev-" + Date.now(),
                }),
                {
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        // Send via Resend
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to: normalizedRecipients,
                subject,
                html,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            return new Response(JSON.stringify({ error: data }), {
                status: res.status,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
