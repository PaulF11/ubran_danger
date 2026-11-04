# Routing

Route analysis validates both endpoints and the returned geometry against the
Taguig City and Pateros coverage envelope. It compares each route segment with
verified, geocoded incidents and reports nearby incident details. The
proximity threshold defaults to 500 metres and is configurable only on the
backend.

## Profiles and ETA

- Car: OSRM-compatible driving profile and provider duration.
- Walking: OSRM-compatible pedestrian profile and provider duration.
- Bicycle: OSRM-compatible cycling profile and provider duration.
- Motorcycle: general motor-vehicle geometry with a configured estimated
  speed; not a motorcycle-specific provider profile.
- Truck: general motor-vehicle geometry with a configured estimated speed; it
  does not enforce truck restrictions.

Motorcycle and truck durations are explicitly estimates and do not include
live traffic or vehicle-specific restrictions. The UI identifies this
provenance instead of presenting it as provider-calculated ETA.

Alternative routes are analyzed using the same incident evidence. A
recommendation is shown only when exposure is lower and distance and duration
remain within the configured tolerance. This is route exposure intelligence,
not a safety guarantee or official crime score.

Location search uses the Photon public demo API, restricted to Taguig and
Pateros results within the displayed coverage. Provider availability and
usage-policy limits apply.
