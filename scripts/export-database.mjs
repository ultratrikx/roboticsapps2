#!/usr/bin/env node

/**
 * Exports all application data from Supabase into CSV files.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const OUTPUT_DIR = join(process.cwd(), "exports");

function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows) {
  if (!rows || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => headers.map((h) => escapeCsvValue(row[h])).join(",")),
  ];
  return lines.join("\n");
}

async function fetchAll(table, options = {}) {
  const query = supabase.from(table).select(options.select || "*");
  if (options.order) query.order(options.order);
  const { data, error } = await query;
  if (error) {
    console.error(`Error fetching ${table}:`, error.message);
    return [];
  }
  return data;
}

async function exportTable(name, options = {}) {
  console.log(`Exporting ${name}...`);
  const data = await fetchAll(name, options);
  if (data.length === 0) {
    console.log(`  ${name}: no rows, skipping`);
    return;
  }
  writeFileSync(join(OUTPUT_DIR, `${name}.csv`), toCsv(data));
  console.log(`  ${name}: ${data.length} rows`);
}

async function exportJoinedApplications() {
  console.log("Exporting joined application overview...");

  const { data: apps, error } = await supabase
    .from("applications")
    .select(
      "*, profiles(first_name, last_name, email, phone, grade, student_number), application_positions(*, positions(title))"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching joined applications:", error.message);
    return;
  }

  // Flatten into one row per application-position
  const rows = [];
  for (const app of apps) {
    const profile = app.profiles || {};
    const positions = app.application_positions || [];

    if (positions.length === 0) {
      rows.push({
        application_id: app.id,
        user_id: app.user_id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        phone: profile.phone,
        grade: profile.grade,
        student_number: profile.student_number,
        application_status: app.status,
        submitted_at: app.submitted_at,
        created_at: app.created_at,
        position_title: "",
        position_status: "",
        position_rank: "",
      });
    } else {
      for (const ap of positions) {
        rows.push({
          application_id: app.id,
          user_id: app.user_id,
          first_name: profile.first_name,
          last_name: profile.last_name,
          email: profile.email,
          phone: profile.phone,
          grade: profile.grade,
          student_number: profile.student_number,
          application_status: app.status,
          submitted_at: app.submitted_at,
          created_at: app.created_at,
          position_title: ap.positions?.title || "",
          position_status: ap.status,
          position_rank: ap.position_rank,
        });
      }
    }
  }

  if (rows.length > 0) {
    writeFileSync(join(OUTPUT_DIR, "applications_overview.csv"), toCsv(rows));
    console.log(`  applications_overview: ${rows.length} rows`);
  }
}

async function exportResponsesWithQuestions() {
  console.log("Exporting responses with questions...");

  const { data, error } = await supabase
    .from("responses")
    .select("*, questions(prompt, type, position_id)");

  if (error) {
    console.error("Error fetching responses with questions:", error.message);
    return;
  }

  const rows = data.map((r) => ({
    response_id: r.id,
    application_id: r.application_id,
    question_id: r.question_id,
    question_prompt: r.questions?.prompt || "",
    question_type: r.questions?.type || "",
    question_position_id: r.questions?.position_id || "",
    content: r.content,
    updated_at: r.updated_at,
  }));

  if (rows.length > 0) {
    writeFileSync(join(OUTPUT_DIR, "responses_with_questions.csv"), toCsv(rows));
    console.log(`  responses_with_questions: ${rows.length} rows`);
  }
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const timestamp = new Date().toISOString();
  console.log(`Database export started at ${timestamp}\n`);

  // Export raw tables
  await Promise.all([
    exportTable("profiles"),
    exportTable("applications"),
    exportTable("application_positions"),
    exportTable("positions", { order: "sort_order" }),
    exportTable("questions", { order: "sort_order" }),
    exportTable("responses"),
    exportTable("activities"),
    exportTable("honors"),
    exportTable("reviews"),
    exportTable("decisions"),
    exportTable("interview_slots"),
    exportTable("interview_bookings"),
    exportTable("settings"),
  ]);

  // Export joined views
  await exportJoinedApplications();
  await exportResponsesWithQuestions();

  // Write a metadata file
  writeFileSync(
    join(OUTPUT_DIR, "export_metadata.csv"),
    toCsv([{ exported_at: timestamp, supabase_url: SUPABASE_URL }])
  );

  console.log("\nExport complete! Files written to:", OUTPUT_DIR);
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
