import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:urban_danger/core/taguig_region.dart';
import 'package:urban_danger/services/route_service.dart';

void main() {
  test(
    'route service posts existing endpoints and parses OSRM geometry',
    () async {
      late http.Request request;
      final client = MockClient((incoming) async {
        request = incoming;
        return http.Response(
          jsonEncode({
            'success': true,
            'data': {
              'distanceMeters': 1200,
              'durationSeconds': 600,
              'coordinates': [
                [121.0, 14.5],
                [121.01, 14.51],
              ],
              'routeIntelligence': {
                'category': 'NO_VERIFIED_INCIDENTS_NEAR_ROUTE',
                'message': 'No verified incidents found near this route.',
                'nearbyVerifiedIncidentCount': 0,
                'severityCounts': {'HIGH': 0, 'MEDIUM': 0, 'LOW': 0},
                'incidents': [],
                'usableVerifiedIncidentCount': 1,
                'proximityThresholdMeters': 500,
                'datasetLimited': true,
                'basis': 'Currently verified incidents in the system',
              },
            },
          }),
          200,
        );
      });
      final service = RouteService(
        client: client,
        baseUri: Uri.parse('https://example.test'),
      );
      addTearDown(service.close);

      final plan = await service.fetchRoute(
        start: const LatLng(14.5, 121),
        destination: const LatLng(14.51, 121.01),
      );
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      expect(request.url.path, '/api/routes/route');
      expect(body['start']['latitude'], 14.5);
      expect(plan.points.length, 2);
      expect(plan.intelligence.nearbyVerifiedIncidentCount, 0);
    },
  );

  test('route service reports OSRM/API calculation failure', () async {
    final service = RouteService(
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({
            'success': false,
            'message': 'Route service is unavailable. Please try again later.',
          }),
          502,
        ),
      ),
      baseUri: Uri.parse('https://example.test'),
    );
    addTearDown(service.close);

    await expectLater(
      service.fetchRoute(
        start: const LatLng(14.5, 121),
        destination: const LatLng(14.51, 121.01),
      ),
      throwsA(
        isA<RouteException>().having(
          (error) => error.message,
          'message',
          contains('Route service is unavailable'),
        ),
      ),
    );
  });

  test(
    'route service parses OSRM alternatives and recommendation metadata',
    () async {
      final service = RouteService(
        client: MockClient(
          (_) async => http.Response(
            jsonEncode({
              'success': true,
              'data': {
                'distanceMeters': 1200,
                'durationSeconds': 600,
                'coordinates': [
                  [121.0, 14.5],
                  [121.01, 14.51],
                ],
                'routeIntelligence': {
                  'category': 'NO_VERIFIED_INCIDENTS_NEAR_ROUTE',
                  'message': 'No verified incidents found near this route.',
                  'nearbyVerifiedIncidentCount': 0,
                  'severityCounts': {'HIGH': 0, 'MEDIUM': 0, 'LOW': 0},
                  'incidents': [],
                  'usableVerifiedIncidentCount': 1,
                  'proximityThresholdMeters': 500,
                  'weightedExposureScore': 0,
                  'datasetLimited': true,
                  'basis': 'Currently verified incidents in the system',
                },
                'alternatives': [
                  {
                    'distanceMeters': 1400,
                    'durationSeconds': 720,
                    'coordinates': [
                      [121.0, 14.5],
                      [121.015, 14.515],
                    ],
                    'routeIntelligence': {
                      'category': 'VERIFIED_INCIDENTS_NEAR_ROUTE',
                      'message': 'Verified incidents found near this route.',
                      'nearbyVerifiedIncidentCount': 1,
                      'severityCounts': {'HIGH': 0, 'MEDIUM': 1, 'LOW': 0},
                      'incidents': [],
                      'usableVerifiedIncidentCount': 1,
                      'proximityThresholdMeters': 500,
                      'weightedExposureScore': 2,
                      'datasetLimited': true,
                      'basis': 'Currently verified incidents in the system',
                    },
                  },
                ],
                'recommendation': {
                  'recommendedRouteIndex': null,
                  'reason': 'No supported alternative.',
                  'methodology': 'Compare verified data.',
                },
              },
            }),
            200,
          ),
        ),
        baseUri: Uri.parse('https://example.test'),
      );
      addTearDown(service.close);

      final analysis = await service.fetchRoutes(
        start: const LatLng(14.5, 121),
        destination: const LatLng(14.51, 121.01),
      );
      expect(analysis.routes, hasLength(2));
      expect(analysis.routes.last.distanceMeters, 1400);
      expect(analysis.recommendationReason, 'No supported alternative.');
    },
  );

  test('Taguig route selection scope still rejects out-of-scope locations', () {
    expect(isWithinTaguigMapArea(const LatLng(14.5176, 121.0509)), isTrue);
    expect(isWithinTaguigMapArea(const LatLng(14.60, 121.11)), isFalse);
  });
}
