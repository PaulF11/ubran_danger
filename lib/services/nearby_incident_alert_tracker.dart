import 'package:latlong2/latlong.dart';
import 'package:urban_danger/core/taguig_region.dart';
import 'package:urban_danger/models/incident.dart';

const int defaultNearbyAlertRadiusMeters = int.fromEnvironment(
  'NEARBY_ALERT_RADIUS_METERS',
  defaultValue: 200,
);

class NearbyIncidentAlert {
  const NearbyIncidentAlert({required this.incident, required this.distance});

  final Incident incident;
  final double distance;
}

class NearbyIncidentAlertTracker {
  NearbyIncidentAlertTracker({
    this.radiusMeters = defaultNearbyAlertRadiusMeters,
    this.reentryBufferMeters = 50,
    this.cooldown = const Duration(minutes: 30),
  }) : assert(radiusMeters > 0),
       assert(reentryBufferMeters >= 0);

  final int radiusMeters;
  final int reentryBufferMeters;
  final Duration cooldown;
  final Distance _distance = const Distance();
  final Set<int> _insideIncidentIds = {};
  final Map<int, DateTime> _lastAlertedAt = {};

  List<NearbyIncidentAlert> update({
    required LatLng position,
    required Iterable<Incident> incidents,
    DateTime? now,
  }) {
    if (!isWithinTaguigMapArea(position)) {
      _insideIncidentIds.clear();
      return const [];
    }
    final timestamp = now ?? DateTime.now();
    final activeIds = <int>{};
    final alerts = <NearbyIncidentAlert>[];

    for (final incident in incidents) {
      final latitude = incident.latitude;
      final longitude = incident.longitude;
      if (incident.verificationStatus != 'VERIFIED' ||
          incident.city != 'Taguig City' ||
          latitude == null ||
          longitude == null ||
          !latitude.isFinite ||
          !longitude.isFinite) {
        continue;
      }
      final incidentPosition = LatLng(latitude, longitude);
      if (!isWithinTaguigMapArea(incidentPosition)) continue;

      final distance = _distance.as(
        LengthUnit.Meter,
        position,
        incidentPosition,
      );
      if (distance <= radiusMeters) {
        activeIds.add(incident.id);
        final wasInside = _insideIncidentIds.contains(incident.id);
        final lastAlert = _lastAlertedAt[incident.id];
        final cooldownElapsed =
            lastAlert == null || timestamp.difference(lastAlert) >= cooldown;
        if (!wasInside && cooldownElapsed) {
          alerts.add(
            NearbyIncidentAlert(incident: incident, distance: distance),
          );
          _lastAlertedAt[incident.id] = timestamp;
        }
      } else if (distance > radiusMeters + reentryBufferMeters) {
        _lastAlertedAt.removeWhere(
          (id, lastAlert) =>
              id == incident.id && timestamp.difference(lastAlert) >= cooldown,
        );
      } else if (_insideIncidentIds.contains(incident.id)) {
        activeIds.add(incident.id);
      }
    }

    _insideIncidentIds
      ..clear()
      ..addAll(activeIds);
    return alerts;
  }
}
