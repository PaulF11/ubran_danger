import 'package:flutter_test/flutter_test.dart';
import 'package:urban_danger/models/route_plan.dart';

Map<String, dynamic> routeJson({
  String category = 'VERIFIED_INCIDENTS_NEAR_ROUTE',
  String message = 'Verified incidents found near this route.',
  int? nearbyCount = 1,
  Map<String, dynamic>? severityCounts = const {
    'HIGH': 1,
    'MEDIUM': 0,
    'LOW': 0,
  },
  List<Map<String, dynamic>> incidents = const [
    {
      'id': 1,
      'category': 'Assault',
      'severity': 'HIGH',
      'barangay': 'Santa Ana',
      'locationDescription': 'Near a public road',
      'incidentDate': '2025-09-24',
      'distanceMeters': 125.5,
    },
  ],
  int? usableCount = 3,
  double? thresholdMeters = 500,
}) => {
  'distanceMeters': 1200,
  'durationSeconds': 600,
  'coordinates': [
    [121.0, 14.5],
    [121.005, 14.51],
  ],
  'routeIntelligence': {
    'category': category,
    'message': message,
    'nearbyVerifiedIncidentCount': nearbyCount,
    'severityCounts': severityCounts,
    'incidents': incidents,
    'usableVerifiedIncidentCount': usableCount,
    'proximityThresholdMeters': thresholdMeters,
    'datasetLimited': true,
    'basis': 'Currently verified incidents in the system',
  },
};

void main() {
  test('route model preserves OSRM geometry and structured intelligence', () {
    final route = RoutePlan.fromJson(routeJson());

    expect(route.distanceMeters, 1200);
    expect(route.durationSeconds, 600);
    expect(route.points.length, 2);
    expect(route.points.first.latitude, 14.5);
    expect(route.points.first.longitude, 121);
    expect(route.intelligence.nearbyVerifiedIncidentCount, 1);
    expect(route.intelligence.severityCounts?['HIGH'], 1);
    expect(route.intelligence.incidents.single.distanceMeters, 125.5);
  });

  test('route model represents zero incidents and missing usable coordinates', () {
    final route = RoutePlan.fromJson(
      routeJson(
        category: 'NO_GEOCODED_VERIFIED_INCIDENTS',
        message:
            'No verified incidents with usable coordinates are currently available for route comparison.',
        nearbyCount: 0,
        severityCounts: const {'HIGH': 0, 'MEDIUM': 0, 'LOW': 0},
        incidents: const [],
        usableCount: 0,
      ),
    );

    expect(route.intelligence.nearbyVerifiedIncidentCount, 0);
    expect(route.intelligence.usableVerifiedIncidentCount, 0);
    expect(route.intelligence.incidents, isEmpty);
  });

  test('route model rejects missing intelligence and malformed geometry', () {
    final missingIntelligence = routeJson()..remove('routeIntelligence');
    expect(
      () => RoutePlan.fromJson(missingIntelligence),
      throwsA(isA<FormatException>()),
    );

    final malformedGeometry = routeJson()
      ..['coordinates'] = [
        [121.0, 100.0],
        [121.1, 14.5],
      ];
    expect(
      () => RoutePlan.fromJson(malformedGeometry),
      throwsA(isA<FormatException>()),
    );
  });
}
