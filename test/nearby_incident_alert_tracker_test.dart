// File note: This file handles nearby_incident_alert_tracker_test.dart.

import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:urban_danger/models/incident.dart';
import 'package:urban_danger/services/nearby_incident_alert_tracker.dart';

void main() {
  const user = LatLng(14.5176, 121.0509);
  final now = DateTime.utc(2026, 10, 18);

  test('alerts once on entry and suppresses duplicate location updates', () {
    final tracker = NearbyIncidentAlertTracker();
    final nearby = verifiedIncident(1, latitude: 14.5181);

    final alerts = tracker.update(
      position: user,
      incidents: [nearby],
      now: now,
    );
    expect(alerts, hasLength(1));
    expect(alerts.single.distance, inInclusiveRange(54, 57));
    expect(
      tracker.update(
        position: user,
        incidents: [nearby],
        now: now.add(const Duration(minutes: 2)),
      ),
      isEmpty,
    );
  });

  test('uses distance transition and cooldown before alerting again', () {
    final tracker = NearbyIncidentAlertTracker();
    final nearby = verifiedIncident(1, latitude: 14.5181);
    final far = const LatLng(14.522, 121.0509);

    tracker.update(position: user, incidents: [nearby], now: now);
    tracker.update(position: far, incidents: [nearby], now: now);
    expect(
      tracker.update(
        position: user,
        incidents: [nearby],
        now: now.add(const Duration(minutes: 5)),
      ),
      isEmpty,
    );
    tracker.update(
      position: far,
      incidents: [nearby],
      now: now.add(const Duration(minutes: 31)),
    );
    expect(
      tracker.update(
        position: user,
        incidents: [nearby],
        now: now.add(const Duration(minutes: 31)),
      ),
      hasLength(1),
    );
  });

  test('ignores unverified, missing-coordinate, and out-of-area incidents', () {
    final tracker = NearbyIncidentAlertTracker();
    final candidates = [
      verifiedIncident(1, latitude: 14.5181),
      verifiedIncident(2, latitude: null),
      verifiedIncident(3, latitude: 14.5181, status: 'PENDING_REVIEW'),
      verifiedIncident(4, latitude: 14.7),
    ];

    final alerts = tracker.update(
      position: user,
      incidents: candidates,
      now: now,
    );
    expect(alerts, hasLength(1));
    expect(alerts.single.incident.id, 1);
  });

  test('location outside Taguig never generates nearby alerts', () {
    final tracker = NearbyIncidentAlertTracker();
    expect(
      tracker.update(
        position: const LatLng(14.7, 121.2),
        incidents: [verifiedIncident(1, latitude: 14.5181)],
        now: now,
      ),
      isEmpty,
    );
  });

  test('incident distance outside the 200 meter alert radius is ignored', () {
    final tracker = NearbyIncidentAlertTracker();
    expect(
      tracker.update(
        position: user,
        incidents: [verifiedIncident(1, latitude: 14.5196)],
        now: now,
      ),
      isEmpty,
    );
  });
}

Incident verifiedIncident(
  int id, {
  required double? latitude,
  String status = 'VERIFIED',
}) => Incident(
  id: id,
  categoryName: 'Theft',
  categoryDescription: 'Theft',
  city: 'Taguig City',
  barangay: 'Santa Ana',
  latitude: latitude,
  longitude: 121.0509,
  locationDescription: 'Near the road',
  locationSourceName: 'GMA News',
  locationSourceUrl: 'https://example.test/location',
  description: 'Verified source report',
  severity: 'MEDIUM',
  incidentDate: DateTime.utc(2026, 10, 10),
  incidentTimeKnown: false,
  source: 'GMA News',
  sourceName: 'GMA News',
  sourceUrl: 'https://example.test/article',
  sourcePublishedAt: '2026-10-10',
  verificationStatus: status,
  verificationMethod: 'TRUSTED_SOURCE',
  lastVerifiedAt: DateTime.utc(2026, 10, 11),
);
