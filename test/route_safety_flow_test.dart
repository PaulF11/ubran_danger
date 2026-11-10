// File note: This file handles route_safety_flow_test.dart.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:urban_danger/screens/map/route_safety_summary.dart';
import 'package:urban_danger/services/route_service.dart';

void main() {
  testWidgets('route API data flows into the rendered safety summary', (
    tester,
  ) async {
    final routeClient = MockClient(
      (_) async => http.Response(
        jsonEncode({
          'success': true,
          'data': {
            'distanceMeters': 800,
            'durationSeconds': 300,
            'coordinates': [
              [121.0509, 14.5176],
              [121.0519, 14.5186],
            ],
            'routeIntelligence': {
              'category': 'NO_VERIFIED_INCIDENTS_NEAR_ROUTE',
              'message': 'No verified incidents found near this route.',
              'nearbyVerifiedIncidentCount': 0,
              'severityCounts': {'HIGH': 0, 'MEDIUM': 0, 'LOW': 0},
              'incidents': [],
              'usableVerifiedIncidentCount': 0,
              'proximityThresholdMeters': 500,
              'datasetLimited': true,
              'basis': 'Currently verified incidents in the system',
            },
          },
        }),
        200,
      ),
    );
    addTearDown(routeClient.close);
    final routeService = RouteService(
      client: routeClient,
      baseUri: Uri.parse('https://example.test'),
    );
    addTearDown(routeService.close);
    final plan = await routeService.fetchRoute(
      start: const LatLng(14.5176, 121.0509),
      destination: const LatLng(14.5186, 121.0519),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: RouteSafetySummary(intelligence: plan.intelligence),
        ),
      ),
    );
    expect(
      find.text('No verified incidents found near this route.'),
      findsOneWidget,
    );
    expect(
      find.text('0 nearby verified incidents within 500 m.'),
      findsOneWidget,
    );
  });
}
