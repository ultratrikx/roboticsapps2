import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * AI Analysis Edge Function
 *
 * Generates AI responses using an applicant's profile data, then computes
 * embedding cosine similarity between generated and actual responses to
 * detect potential AI usage.
 *
 * Required secrets:
 *   GEMINI_API_KEY              - Google Gemini API key
 *   OPENAI_API_KEY              - (Optional) OpenAI API key for alternative provider
 *   SUPABASE_URL                - Auto-provided
 *   SUPABASE_SERVICE_ROLE_KEY   - Auto-provided
 *
 * Request body:
 *   applicationId  - UUID of the application to analyze
 *   provider       - "gemini" (default) or "openai"
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SITE_URL =
    Deno.env.get("SITE_URL") || "https://applications.wossrobotics.ca";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
    "Access-Control-Allow-Origin": SITE_URL,
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Provider abstraction
// ---------------------------------------------------------------------------

interface AIProvider {
    generateResponse(systemPrompt: string, userPrompt: string): Promise<string>;
    getEmbeddings(texts: string[]): Promise<number[][]>;
    modelName: string;
}

class GeminiProvider implements AIProvider {
    modelName = "gemini-3-flash-preview";
    private embeddingModel = "gemini-embedding-2-preview";

    async generateResponse(
        systemPrompt: string,
        userPrompt: string,
    ): Promise<string> {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ parts: [{ text: userPrompt }] }],
                generationConfig: {
                    temperature: 0.9,
                    maxOutputTokens: 2048,
                    thinkingConfig: { thinkingLevel: "minimal" },
                },
            }),
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Gemini generation failed: ${res.status} ${err}`);
        }
        const data = await res.json();
        // Extract text from the first candidate, skipping any thought parts
        const parts = data.candidates?.[0]?.content?.parts || [];
        const textPart = parts.find((p: any) => p.text && !p.thought);
        return textPart?.text || parts[parts.length - 1]?.text || "";
    }

    async getEmbeddings(texts: string[]): Promise<number[][]> {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.embeddingModel}:batchEmbedContents?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requests: texts.map((text) => ({
                    model: `models/${this.embeddingModel}`,
                    content: { parts: [{ text }] },
                })),
            }),
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Gemini embedding failed: ${res.status} ${err}`);
        }
        const data = await res.json();
        return (data.embeddings || []).map((e: any) => e.values);
    }
}

class OpenAIProvider implements AIProvider {
    modelName = "gpt-5.4-mini";
    private embeddingModel = "text-embedding-3-small";

    async generateResponse(
        systemPrompt: string,
        userPrompt: string,
    ): Promise<string> {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: this.modelName,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0.9,
                max_tokens: 2048,
            }),
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`OpenAI generation failed: ${res.status} ${err}`);
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content || "";
    }

    async getEmbeddings(texts: string[]): Promise<number[][]> {
        const res = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: this.embeddingModel,
                input: texts,
            }),
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`OpenAI embedding failed: ${res.status} ${err}`);
        }
        const data = await res.json();
        return (data.data || [])
            .sort((a: any, b: any) => a.index - b.index)
            .map((d: any) => d.embedding);
    }
}

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0,
        normA = 0,
        normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Build system prompt for human-sounding AI response
// ---------------------------------------------------------------------------

function buildSystemPrompt(
    profile: any,
    activities: any[],
    honors: any[],
    positions: string[],
): string {
    const activitiesText = activities
        .map(
            (a) =>
                `- ${a.role || "Member"} ${a.organization ? `at ${a.organization}` : ""} (${a.type || "Activity"}): ${a.description || "No description"}`,
        )
        .join("\n");

    const honorsText = honors
        .map(
            (h) =>
                `- ${h.title} (${h.grade_level || "N/A"}, ${h.recognition_level || "N/A"})`,
        )
        .join("\n");

    return `You are ${profile.first_name || "a student"} ${profile.last_name || ""}, a Grade ${profile.grade || "11/12"} high school student applying for an executive position in your school's robotics club. You're applying for: ${positions.join(", ")}.

Write your response as this specific student would — first person, natural teenage voice, referencing YOUR real experiences below. Be genuine and specific. Use contractions (I'm, don't, we've). Include small personal details and anecdotes. Vary your sentence lengths. It's okay to be slightly informal or have minor imperfections — that's how real students write.

DO NOT:
- Use phrases like "I am passionate about", "I firmly believe", "In conclusion", "Furthermore", "Moreover"
- Write overly polished or corporate-sounding prose
- Use bullet points or numbered lists
- Start multiple sentences with "I"
- Sound like you're reciting a resume — weave experiences into a natural narrative

YOUR ACTIVITIES:
${activitiesText || "(No activities listed)"}

YOUR HONORS & AWARDS:
${honorsText || "(No honors listed)"}

Keep your response under the character limit specified. Write ONLY the response text, nothing else.`;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Auth check
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

        // Admin check
        const { data: adminProfile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();

        if (adminProfile?.role !== "admin") {
            return new Response(
                JSON.stringify({ error: "Admin access required" }),
                {
                    status: 403,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        const { applicationId, provider: providerName = "gemini" } =
            await req.json();

        if (!applicationId) {
            return new Response(
                JSON.stringify({ error: "applicationId is required" }),
                {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        // Select provider
        let provider: AIProvider;
        if (providerName === "openai") {
            if (!OPENAI_API_KEY) {
                return new Response(
                    JSON.stringify({
                        error: "OPENAI_API_KEY not configured",
                    }),
                    {
                        status: 500,
                        headers: {
                            ...corsHeaders,
                            "Content-Type": "application/json",
                        },
                    },
                );
            }
            provider = new OpenAIProvider();
        } else {
            if (!GEMINI_API_KEY) {
                return new Response(
                    JSON.stringify({
                        error: "GEMINI_API_KEY not configured",
                    }),
                    {
                        status: 500,
                        headers: {
                            ...corsHeaders,
                            "Content-Type": "application/json",
                        },
                    },
                );
            }
            provider = new GeminiProvider();
        }

        // Fetch application
        const { data: app, error: appError } = await supabase
            .from("applications")
            .select(
                "*, application_positions(*, positions(title, description))",
            )
            .eq("id", applicationId)
            .single();

        if (appError || !app) {
            return new Response(
                JSON.stringify({ error: "Application not found" }),
                {
                    status: 404,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        // Fetch all applicant data in parallel
        const [profileResult, activitiesResult, honorsResult, responsesResult] =
            await Promise.all([
                supabase
                    .from("profiles")
                    .select("*")
                    .eq("id", app.user_id)
                    .single(),
                supabase
                    .from("activities")
                    .select("*")
                    .eq("user_id", app.user_id)
                    .order("sort_order"),
                supabase
                    .from("honors")
                    .select("*")
                    .eq("user_id", app.user_id)
                    .order("sort_order"),
                supabase
                    .from("responses")
                    .select("*, questions(prompt, description, char_limit)")
                    .eq("application_id", app.id),
            ]);

        const profile = profileResult.data;
        const activities = activitiesResult.data || [];
        const honors = honorsResult.data || [];
        const responses = responsesResult.data || [];

        if (!profile) {
            return new Response(
                JSON.stringify({ error: "Applicant profile not found" }),
                {
                    status: 404,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        const positionTitles = (app.application_positions || [])
            .map((ap: any) => ap.positions?.title)
            .filter(Boolean);

        const systemPrompt = buildSystemPrompt(
            profile,
            activities,
            honors,
            positionTitles,
        );

        // Process each response: generate AI version + compute similarity
        const results: any[] = [];
        const errors: any[] = [];

        for (const resp of responses) {
            if (!resp.content || !resp.questions?.prompt) continue;

            try {
                const charLimit = resp.questions.char_limit || 2000;
                const userPrompt = `QUESTION: ${resp.questions.prompt}${resp.questions.description ? `\n${resp.questions.description}` : ""}\n\nCharacter limit: ${charLimit} characters. Write a complete response.`;

                // Generate AI response
                const generatedResponse = await provider.generateResponse(
                    systemPrompt,
                    userPrompt,
                );

                // Get embeddings for both responses
                const embeddings = await provider.getEmbeddings([
                    resp.content,
                    generatedResponse,
                ]);

                const similarityScore =
                    embeddings.length === 2
                        ? cosineSimilarity(embeddings[0], embeddings[1])
                        : 0;

                // Upsert result
                const { error: upsertError } = await supabase
                    .from("ai_analysis_results")
                    .upsert(
                        {
                            application_id: applicationId,
                            question_id: resp.question_id,
                            generated_response: generatedResponse,
                            similarity_score: similarityScore,
                            provider: providerName,
                            model: provider.modelName,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: "application_id,question_id" },
                    );

                if (upsertError) {
                    errors.push({
                        questionId: resp.question_id,
                        error: upsertError.message,
                    });
                } else {
                    results.push({
                        questionId: resp.question_id,
                        generatedResponse,
                        similarityScore,
                    });
                }
            } catch (e) {
                errors.push({
                    questionId: resp.question_id,
                    error: (e as Error).message,
                });
            }
        }

        return new Response(
            JSON.stringify({
                applicationId,
                provider: providerName,
                model: provider.modelName,
                results,
                errors: errors.length > 0 ? errors : undefined,
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
