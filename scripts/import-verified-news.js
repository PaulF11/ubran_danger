// File note: This file handles import-verified-news.js.

const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");

const reports = [
  {
    category: "Robbery",
    city: "Taguig City",
    barangay: "Central Signal Village",
    locationDescription: "General Espino Street, Barangay Central Signal",
    latitude: 14.5116817,
    longitude: 121.0559372,
    locationSourceUrl: "https://www.openstreetmap.org/node/4237680099",
    incidentDate: "2026-11-01 20:44:00",
    incidentTimeKnown: true,
    sourceName: "Daily Tribune",
    sourceUrl: "https://tribune.net.ph/2026/11/03/2-men-nabbed-after-armed-barbershop-heist-in-taguig",
    sourcePublishedAt: "2026-11-03",
    severity: "HIGH",
    description:
      "Police reported that two men allegedly robbed a barbershop at gunpoint on 1 November 2026. One allegedly entered while the other acted as lookout and getaway driver. Police said both were arrested on 2 November after CCTV review; the sling bag was recovered while about P10,000 remained missing.",
    verificationMethod: "Manual review of the original Daily Tribune article and OpenStreetMap location record.",
  },
  {
    category: "Shooting",
    city: "Taguig City",
    barangay: "Western Bicutan",
    locationDescription: "Purok 1, PNR Site, Barangay Western Bicutan",
    latitude: 14.5095273,
    longitude: 121.0380244,
    locationSourceUrl: "https://www.openstreetmap.org/relation/6306287",
    incidentDate: "2026-10-22 00:00:00",
    incidentTimeKnown: false,
    sourceName: "GMA News",
    sourceUrl: "https://www.gmanetwork.com/news/balitambayan/balita/1006850/2-lalaking-sakay-sa-motorsiklo-na-umiwas-sa-oplan-sita-patay-nang-makipagbarilan-umano-sa-mga-pu/story",
    sourcePublishedAt: "2026-10-22",
    severity: "HIGH",
    description:
      "GMA News reported that two men on a motorcycle allegedly fled an Oplan Sita operation in Purok Uno, Barangay Western Bicutan, and later died in an armed encounter with pursuing police. The account is attributed to authorities and reports that one suspect was linked to a prior case.",
    verificationMethod: "Manual review of the original GMA News report and OpenStreetMap location record; account remains attributed to police reporting.",
  },
  {
    category: "Drug-related",
    city: "Taguig City",
    barangay: "Maharlika Village",
    locationDescription: "Barangay Maharlika Village",
    latitude: 14.4973556,
    longitude: 121.0555416,
    locationSourceUrl: "https://www.openstreetmap.org/relation/10988111",
    incidentDate: "2026-10-14 17:20:00",
    incidentTimeKnown: true,
    sourceName: "Daily Tribune",
    sourceUrl: "https://tribune.net.ph/2026/10/15/high-value-target-collared-2",
    sourcePublishedAt: "2026-10-16",
    severity: "LOW",
    description:
      "Daily Tribune reported that police arrested a 48-year-old man identified as Naim during a buy-bust operation in Barangay Maharlika Village on 14 October 2026. Police said they recovered about 150 grams of suspected shabu valued at approximately P1.02 million.",
    verificationMethod: "Manual review of the original Daily Tribune article and OpenStreetMap location record; drug allegations remain attributed to police.",
  },
  {
    category: "Assault",
    city: "Taguig City",
    barangay: "Cembo",
    locationDescription: "Barangay Cembo",
    latitude: 14.5647149,
    longitude: 121.0506111,
    locationSourceUrl: "https://www.openstreetmap.org/relation/104458",
    incidentDate: "2026-09-30 00:00:00",
    incidentTimeKnown: false,
    sourceName: "Daily Tribune",
    sourceUrl: "https://tribune.net.ph/2026/10/01/nurse-arrested-after-alleged-shooting-during-taguig-dispute",
    sourcePublishedAt: "2026-10-01",
    severity: "HIGH",
    description:
      "Daily Tribune reported that a 41-year-old registered nurse was arrested after allegedly firing a .45-caliber pistol during a dispute in Barangay Cembo. Police said the victim was injured by cement debris and that a firearm was recovered; the allegations were referred for further investigation.",
    verificationMethod: "Manual review of the original Daily Tribune article and OpenStreetMap location record; allegations remain attributed to police.",
  },
  {
    category: "Police-related",
    city: "Taguig City",
    barangay: "New Lower Bicutan",
    locationDescription: "Ilang-Ilang and Batangas Streets, Barangay New Lower Bicutan",
    latitude: 14.5053409,
    longitude: 121.0653629,
    locationSourceUrl: "https://www.openstreetmap.org/relation/10989134",
    incidentDate: "2026-10-06 00:00:00",
    incidentTimeKnown: false,
    sourceName: "Daily Tribune",
    sourceUrl: "https://tribune.net.ph/amp/story/2026/10/08/taguig-cops-relieved-over-alleged-drug-arrest-incident",
    sourcePublishedAt: "2026-10-12",
    severity: "LOW",
    description:
      "Daily Tribune and Philstar reported on the same 6 October 2026 incident in New Lower Bicutan involving an alleged drug-related apprehension of a 24-year-old man. Police personnel were relieved while authorities investigated whether procedures were followed. The family allegations and police account remain disputed and pending review.",
    verificationMethod: "Manual review of the Daily Tribune and Philstar reports; same-event duplicate consolidated and allegations retained as pending review.",
    verificationStatus: "PENDING_REVIEW",
    additionalSources: [
      {
        sourceName: "Philstar",
        sourceUrl: "https://www.philstar.com/nation/2026/10/12/2562505/5-taguig-cops-axed-over-hulidap-scheme",
        sourcePublishedAt: "2026-10-12",
      },
    ],
  },
  {
    category: "Law Enforcement",
    city: "Taguig City",
    barangay: "Western Bicutan",
    locationDescription: "Barangay Western Bicutan",
    latitude: 14.5095273,
    longitude: 121.0380244,
    locationSourceUrl: "https://www.openstreetmap.org/relation/6306287",
    incidentDate: "2026-10-13 00:00:00",
    incidentTimeKnown: false,
    sourceName: "Bureau of Immigration",
    sourceUrl:
      "https://immigration.gov.ph/bi-nabs-south-korean-fugitive-wanted-over-illegal-gambling-activities/",
    sourcePublishedAt: "2026-10-25",
    severity: "MEDIUM",
    description:
      "The Bureau of Immigration reported that its Fugitive Search Unit apprehended a South Korean national wanted in South Korea over alleged illegal gambling activities on 13 October 2026 in Barangay Western Bicutan. The subject was detained pending deportation proceedings.",
    verificationMethod:
      "Manual review of the original Bureau of Immigration release and OpenStreetMap location record; allegations remain attributed to foreign authorities.",
  },
  {
    category: "Fire",
    city: "Taguig City",
    barangay: "New Lower Bicutan",
    locationDescription: "Purok 1, Barangay New Lower Bicutan",
    latitude: 14.5053409,
    longitude: 121.0653629,
    locationSourceUrl: "https://www.openstreetmap.org/relation/10989134",
    incidentDate: "2026-08-26 15:42:00",
    incidentTimeKnown: true,
    sourceName: "Manila Bulletin",
    sourceUrl: "https://mb.com.ph/2026/08/27/taguig-sees-two-fires-within-hours",
    sourcePublishedAt: "2026-08-27",
    severity: "HIGH",
    description:
      "Manila Bulletin reported that a fire began at about 3:42 p.m. in Purok 1, Barangay New Lower Bicutan, damaging two barracks or structures, affecting 12 people, and causing approximately P2 million in damage. The cause was under investigation.",
    verificationMethod:
      "Manual review of the original Manila Bulletin report and OpenStreetMap location record.",
  },
  {
    category: "Fire",
    city: "Taguig City",
    barangay: "South Signal Village",
    locationDescription: "Macapagal Street, Zone 6, Barangay South Signal",
    latitude: 14.5053188,
    longitude: 121.0537147,
    locationSourceUrl: "https://www.openstreetmap.org/node/443181337",
    incidentDate: "2026-08-26 17:19:00",
    incidentTimeKnown: true,
    sourceName: "Manila Bulletin",
    sourceUrl: "https://mb.com.ph/2026/08/27/taguig-sees-two-fires-within-hours",
    sourcePublishedAt: "2026-08-27",
    severity: "MEDIUM",
    description:
      "Manila Bulletin reported that a second fire began at about 5:19 p.m. in a four-storey residential building on Macapagal Street, Zone 6, Barangay South Signal. Four families or 23 people were affected and approximately P50,000 in property damage was reported.",
    verificationMethod:
      "Manual review of the original Manila Bulletin report and OpenStreetMap location record; the shared article confirms this was a separate fire from the New Lower Bicutan blaze.",
  },
  {
    category: "Assault",
    city: "Taguig City",
    barangay: "Pitogo",
    locationDescription: "Barangay Pitogo",
    latitude: 14.5569552,
    longitude: 121.0466409,
    locationSourceUrl: "https://www.openstreetmap.org/relation/131671",
    incidentDate: "2026-07-27 00:00:00",
    incidentTimeKnown: false,
    sourceName: "Manila Bulletin",
    sourceUrl:
      "https://mb.com.ph/2026/07/30/taguig-police-probe-assault-on-motorcycle-taxi-rider",
    sourcePublishedAt: "2026-07-30",
    severity: "LOW",
    description:
      "Manila Bulletin reported that a man punched a motorcycle taxi rider in Barangay Pitogo on 27 July 2026 after the rider dropped off a passenger. Police investigated the assault and the rider expressed intent to file a complaint.",
    verificationMethod:
      "Manual review of the original Manila Bulletin report and OpenStreetMap location record; the police investigation and allegation are retained in the description.",
  },
  {
    category: "Road Accident",
    city: "Taguig City",
    barangay: "Tuktukan",
    locationDescription: "Cayetano Boulevard near a convenience store, Barangay Tuktukan",
    latitude: 14.5283967,
    longitude: 121.0714515,
    locationSourceUrl: "https://www.openstreetmap.org/relation/166722",
    incidentDate: "2026-02-16 00:00:00",
    incidentTimeKnown: false,
    sourceName: "Inquirer",
    sourceUrl:
      "https://newsinfo.inquirer.net/2183449/cop-held-after-car-crashes-into-15-vehicles-hurts-21-in-taguig-city",
    sourcePublishedAt: "2026-02-17",
    severity: "HIGH",
    description:
      "Inquirer reported that a police officer was arrested after an MPV crashed into 14 motorcycles and a sedan near a convenience store along Cayetano Boulevard in Barangay Tuktukan on 16 February 2026, injuring 21 people. Initial police reporting attributed the crash to brake malfunction.",
    verificationMethod:
      "Manual review of the original Inquirer report and OpenStreetMap location record; the reported cause remains attributed to the police report.",
  },
  {
    category: "Shooting",
    city: "Taguig City",
    barangay: "Santa Ana",
    locationDescription: "Pulong Kendi Street, Barangay Santa Ana",
    latitude: 14.5265271,
    longitude: 121.074601,
    locationSourceUrl: "https://www.openstreetmap.org/relation/166723",
    incidentDate: "2026-08-17 05:50:00",
    incidentTimeKnown: true,
    sourceName: "Inquirer",
    sourceUrl:
      "https://newsinfo.inquirer.net/2286517/1-dead-1-hurt-in-taguig-city-shooting-police",
    sourcePublishedAt: "2026-08-17",
    severity: "HIGH",
    description:
      "Inquirer reported that a shooting at about 5:50 a.m. on 17 August 2026 along Pulong Kendi Street in Barangay Santa Ana killed one man and wounded another. Police said the motive and suspect remained under investigation.",
    verificationMethod:
      "Manual review of the original Inquirer report and OpenStreetMap location record; police statements and the ongoing investigation are explicitly attributed.",
  },
  {
    category: "Police-related",
    city: "Taguig City",
    barangay: "Ususan",
    locationDescription: "Sitio Pusawan, Barangay Ususan",
    latitude: 14.5354291,
    longitude: 121.0686799,
    locationSourceUrl: "https://www.openstreetmap.org/relation/1587092",
    incidentDate: "2026-06-23 13:49:00",
    incidentTimeKnown: true,
    sourceName: "Inquirer",
    sourceUrl:
      "https://newsinfo.inquirer.net/2252144/ncrpo-8-injured-arrested-in-land-dispute-clash-in-taguig",
    sourcePublishedAt: "2026-06-24",
    severity: "HIGH",
    description:
      "Inquirer reported that a land dispute clash at about 1:49 p.m. on 23 June 2026 in Sitio Pusawan, Barangay Ususan injured eight people, including five struck by shotgun pellets. Police arrested guards and other civilians and took firearms for examination.",
    verificationMethod:
      "Manual review of the original Inquirer report and OpenStreetMap location record; the account remains attributed to the NCRPO.",
  },
  {
    category: "Law Enforcement",
    city: "Taguig City",
    barangay: "Fort Bonifacio",
    locationDescription: "Bonifacio Global City, Taguig City",
    latitude: 14.550806,
    longitude: 121.050972,
    locationSourceUrl: "https://www.openstreetmap.org/node/14023498207",
    incidentDate: "2026-09-09 00:00:00",
    incidentTimeKnown: false,
    sourceName: "Bureau of Immigration",
    sourceUrl: "https://immigration.gov.ph/bi-hunts-down-australian-fugitive-in-bgc/",
    sourcePublishedAt: "2026-09-10",
    severity: "MEDIUM",
    description:
      "The Bureau of Immigration reported that its Fugitive Search Unit apprehended an Australian national subject to an Interpol Red Notice in Bonifacio Global City, Taguig, on 9 September 2026. The subject was turned over for deportation proceedings.",
    verificationMethod:
      "Manual review of the original Bureau of Immigration release and OpenStreetMap location record; allegations remain attributed to foreign authorities.",
  },
  {
    category: "Drug-related",
    city: "Taguig City",
    barangay: "Western Bicutan",
    locationDescription: "Juliano Avenue near Gate 3 Plaza, Barangay Western Bicutan",
    latitude: 14.5095273,
    longitude: 121.0380244,
    locationSourceUrl: "https://www.openstreetmap.org/relation/6306287",
    incidentDate: "2026-10-19 20:30:00",
    incidentTimeKnown: true,
    sourceName: "Daily Tribune",
    sourceUrl: "https://tribune.net.ph/2026/10/20/p442-k-shabu-seized-in-taguig-buy-bust",
    sourcePublishedAt: "2026-10-20",
    severity: "HIGH",
    description:
      "Daily Tribune reported that police arrested two suspected drug personalities at about 8:30 p.m. on 19 October 2026 near Gate 3 Plaza along Juliano Avenue in Barangay Western Bicutan and seized suspected shabu during a buy-bust operation.",
    verificationMethod:
      "Manual review of the original Daily Tribune report and OpenStreetMap location record; the suspected drugs and alleged offenses remain attributed to police reporting.",
  },
];

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing ${name}.`);
  return value;
}

async function main() {
  const caPath = process.env.DB_SSL_CA || path.join(__dirname, "..", "backend", "src", "config", "aiven-project-ca.pem");
  const connection = await mysql.createConnection({
    host: required("DB_HOST"),
    port: Number(process.env.DB_PORT || 3306),
    user: required("DB_USER"),
    password: required("DB_PASSWORD"),
    database: required("DB_NAME"),
    ssl: { ca: fs.readFileSync(caPath) },
    multipleStatements: true,
  });

  try {
    const migration = (name) =>
      fs
        .readFileSync(path.join(__dirname, "..", "backend", "migrations", name), "utf8")
        .replace(/^\s*USE\s+urban_danger_db\s*;\s*/i, "");
    await connection.query(migration("006_news_import_categories.sql"));
    await connection.query(migration("007_incident_source_references.sql"));
    let inserted = 0;
    let duplicates = 0;
    for (const report of reports) {
      await connection.beginTransaction();
      try {
        const [existing] = await connection.execute(
          `SELECT id
           FROM incidents
           WHERE source_url = ?
             AND incident_date = ?
             AND location_description = ?
           LIMIT 1`,
          [report.sourceUrl, report.incidentDate, report.locationDescription],
        );
        if (existing.length) {
          duplicates += 1;
          await connection.rollback();
          continue;
        }
        const [category] = await connection.execute(
          "SELECT id FROM incident_categories WHERE name = ? LIMIT 1",
          [report.category],
        );
        const [location] = await connection.execute(
          `INSERT INTO locations
            (barangay, latitude, longitude, location_source_name, location_source_url)
           VALUES (?, ?, ?, 'OpenStreetMap Nominatim', ?)`,
          [report.barangay, report.latitude, report.longitude, report.locationSourceUrl],
        );
        const [result] = await connection.execute(
          `INSERT INTO incidents
            (category_id, location_id, city, description, severity, incident_date,
             incident_time_known, location_description, source, source_name,
             source_url, source_published_at, verification_status,
             verification_method, last_verified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
          [
            category[0].id,
            location.insertId,
            report.city,
            report.description,
            report.severity,
            report.incidentDate,
            report.incidentTimeKnown,
            report.locationDescription,
            report.sourceName,
            report.sourceName,
            report.sourceUrl,
            report.sourcePublishedAt,
            report.verificationStatus || "VERIFIED",
            report.verificationMethod,
          ],
        );
        for (const source of [report, ...(report.additionalSources || [])]) {
          await connection.execute(
            `INSERT INTO incident_source_references
              (incident_id, source_name, source_url, source_published_at)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE source_published_at = VALUES(source_published_at)`,
            [result.insertId, source.sourceName, source.sourceUrl, source.sourcePublishedAt],
          );
        }
        await connection.commit();
        inserted += 1;
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
    console.log(JSON.stringify({ inserted, duplicates, pendingReview: reports.filter((report) => report.verificationStatus === "PENDING_REVIEW").length }));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
