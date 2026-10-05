# Incident Data Policy

## Source and Verification

Only source-reviewed articles or official releases from the configured trusted-host list may enter the import workflow. The importer requires an HTTPS source URL, a publisher name, reviewed evidence for Taguig attribution, incident date, location and event facts, an existing category, and a successful database duplicate/conflict check. A missing or inaccessible source URL is rejected or left pending; a publisher's automated-access 403 is accepted only when the source content was manually reviewed. Only candidates passing those checks are inserted as `VERIFIED`; the public API separately requires provenance fields and the Taguig city value.

The source URL and publication date are retained. The legacy `source` field remains populated with the publisher name for API compatibility. A candidate that conflicts with an existing date/location/category/severity remains pending rather than being silently published.

## Location

Barangays are stored only when explicitly named by the source. Coordinates remain `NULL` unless a source location can be matched to a named geographic feature; coordinate provenance is stored on the location row. A barangay name or an unsuccessful/ambiguous geocoder result does not produce a marker. A location with `NULL` coordinates remains available in lists and analytics but is not mapped.

## System-Assigned Severity

Severity is not an official police or government classification. It is deterministic and uses only documented event characteristics:

- `HIGH`: a firearm was used, a death occurred, or the source documents a serious injury.
- `MEDIUM`: a weapon, physical injury, or explicit threat is documented, without a high-severity condition.
- `LOW`: none of those characteristics is documented.

The candidate severity must equal the rule's result. Details identify it as system-assigned.

## Incident Activity

Activity is a count of verified Taguig incidents per explicitly named barangay, using database records only. It is not a crime rate, a population-normalized measure, an official rating, or a claim that a location is safe. The display thresholds are `LOW` (0), `MODERATE` (1-2), `HIGH` (3-5), and `VERY HIGH` (6 or more). The UI states that the measure is based on verified incidents collected by Urban Danger.
