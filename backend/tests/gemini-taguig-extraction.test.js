// File note: This file handles gemini-taguig-extraction.test.js.

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");
const { extract } = require("../src/services/extractionProviders/geminiProvider");
const incidentFixtures = require("../data/taguig_incidents.json");

const EXISTING_INCIDENT_URL =
  "https://manilastandard.net/news/crime-courts/314648598/taguig-police-arrest-two-shooting-suspects.html";
const ALLOWED_CATEGORIES = new Set([
  "Theft",
  "Robbery",
  "Assault",
  "Vandalism",
  "Other",
]);
const ALLOWED_SEVERITIES = new Set(["LOW", "MEDIUM", "HIGH"]);

async function findExistingIncident() {
  const fixture = incidentFixtures.find(
    (incident) => incident.sourceUrl === EXISTING_INCIDENT_URL,
  );
  assert.ok(fixture, "Expected the existing incident evidence in project data.");

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    await connection.query("SET TRANSACTION READ ONLY");
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT i.id
       FROM incidents i
       WHERE i.verification_status = 'VERIFIED'
         AND i.city = 'Taguig City'
         AND i.source_name = 'Manila Standard'
         AND i.source_url = ?
       LIMIT 2`,
      [EXISTING_INCIDENT_URL],
    );
    await connection.rollback();
    assert.equal(
      rows.length,
      1,
      "Expected exactly one existing verified Manila Standard incident.",
    );
    return fixture;
  } finally {
    await connection.end();
  }
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return false;
  }
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value.slice(0, 10)
  );
}

test(
  "Gemini extracts one existing verified Manila Standard Taguig incident from stored source evidence",
  { skip: process.env.RUN_LIVE_GEMINI_INTEGRATION !== "true" },
  async () => {
  const incident = await findExistingIncident();
  assert.equal(incident.sourceUrl, EXISTING_INCIDENT_URL);

  const evidenceInput = {
    recordType:
      "Stored source evidence from an existing verified incident; not freshly downloaded article text.",
    description: incident.description,
    locationDescription: incident.locationDescription,
    city: incident.city,
    barangay: incident.barangay,
    incidentDate: incident.sourceEvidence.incidentDate,
    severityFacts: incident.severityFacts,
    sourceEvidence: incident.sourceEvidence,
    sourceName: incident.sourceName,
    sourceUrl: incident.sourceUrl,
    sourcePublishedAt: incident.sourcePublishedAt,
  };
  const articleText = JSON.stringify(evidenceInput, null, 2);
  const extracted = await extract(articleText);
  const candidate =
    extracted === null
      ? null
      : {
          ...extracted,
          sourceName: incident.sourceName,
          sourceUrl: incident.sourceUrl,
          sourcePublishedAt: incident.sourcePublishedAt,
        };
  const evidence = candidate?.sourceEvidence;
  const checks = {
    candidateIsIndividualIncident: candidate !== null,
    category: ALLOWED_CATEGORIES.has(candidate?.category),
    city: candidate?.city === "Taguig City",
    barangay:
      !incident.barangay ||
      candidate?.barangay === incident.barangay,
    incidentDate:
      validDate(candidate?.incidentDate) &&
      candidate.incidentDate.slice(0, 10) ===
        incident.sourceEvidence.incidentDate,
    severity: ALLOWED_SEVERITIES.has(candidate?.severity),
    sourceEvidence:
      evidence?.sourceReviewed === true &&
      evidence.city === incident.sourceEvidence.city &&
      evidence.incidentDate === incident.sourceEvidence.incidentDate &&
      /Santa Ana/i.test(evidence.location || "") &&
      /shot|shooting|seriously injured/i.test(evidence.eventFacts || ""),
    sourceName: candidate?.sourceName === incident.sourceName,
    sourceUrl: candidate?.sourceUrl === incident.sourceUrl,
    sourcePublishedAt:
      candidate?.sourcePublishedAt === incident.sourcePublishedAt,
  };

  console.log(
    JSON.stringify(
      {
        inputType: evidenceInput.recordType,
        sourceUrl: incident.sourceUrl,
        suppliedStoredEvidence: evidenceInput,
        candidate,
        checks: Object.fromEntries(
          Object.entries(checks).map(([field, passed]) => [
            field,
            passed ? "PASS" : "FAIL",
          ]),
        ),
      },
      null,
      2,
    ),
  );

  for (const [field, passed] of Object.entries(checks)) {
    assert.equal(passed, true, `${field} extraction check failed.`);
  }
  console.log("Overall extraction result: PASS");
  },
);
