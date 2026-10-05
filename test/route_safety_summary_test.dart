import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:urban_danger/models/route_plan.dart';
import 'package:urban_danger/screens/map/route_safety_summary.dart';

RouteIntelligence intelligence({
  String category = 'NO_VERIFIED_INCIDENTS_NEAR_ROUTE',
  String message = 'No verified incidents found near this route.',
  int? count = 0,
  Map<String, int>? severityCounts = const {
    'HIGH': 0,
    'MEDIUM': 0,
    'LOW': 0,
  },
  List<RouteSafetyIncident> incidents = const [],
}) => RouteIntelligence(
  category: category,
  message: message,
  nearbyVerifiedIncidentCount: count,
  severityCounts: severityCounts,
  incidents: incidents,
  usableVerifiedIncidentCount: 4,
  proximityThresholdMeters: 500,
  datasetLimited: true,
  basis: 'Currently verified incidents in the system',
);

void main() {
  testWidgets('summary renders the zero-incident state', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: RouteSafetySummary(intelligence: intelligence()),
        ),
      ),
    );

    expect(find.text('No verified incidents found near this route.'), findsOneWidget);
    expect(find.text('0 nearby verified incidents within 500 m.'), findsOneWidget);
    expect(find.textContaining('HIGH 0  ·  MEDIUM 0  ·  LOW 0'), findsOneWidget);
  });

  testWidgets('summary shows incidents, distance, location, and severities', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: RouteSafetySummary(
            intelligence: intelligence(
              category: 'HIGHER_SEVERITY_VERIFIED_INCIDENTS_NEAR_ROUTE',
              message: 'Higher-severity verified incidents found near this route.',
              count: 1,
              severityCounts: const {'HIGH': 1, 'MEDIUM': 0, 'LOW': 0},
              incidents: const [
                RouteSafetyIncident(
                  id: '42',
                  category: 'Assault',
                  severity: 'HIGH',
                  barangay: 'Santa Ana',
                  locationDescription: null,
                  incidentDate: '2025-09-24',
                  distanceMeters: 125,
                ),
              ],
            ),
          ),
        ),
      ),
    );

    expect(find.text('Higher-severity verified incidents found near this route.'), findsOneWidget);
    expect(find.text('Assault'), findsOneWidget);
    expect(
      find.text('Santa Ana  ·  HIGH  ·  2025-09-24  ·  125 m from route'),
      findsOneWidget,
    );
    expect(find.textContaining('HIGH 1  ·  MEDIUM 0  ·  LOW 0'), findsOneWidget);
  });

  testWidgets('summary clearly states when verified reports lack coordinates', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: RouteSafetySummary(
            intelligence: intelligence(
              category: 'NO_GEOCODED_VERIFIED_INCIDENTS',
              message:
                  'No verified incidents with usable coordinates are currently available for route comparison.',
              count: 0,
              severityCounts: null,
            ),
          ),
        ),
      ),
    );

    expect(
      find.textContaining('without usable coordinates cannot be compared'),
      findsOneWidget,
    );
    expect(find.textContaining('limited; this is not a prediction'), findsOneWidget);
  });

  testWidgets('summary presents API failure without inventing an incident count', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: RouteSafetySummary(
            intelligence: intelligence(
              category: 'UNAVAILABLE',
              message:
                  'Route incident information is temporarily unavailable.',
              count: null,
              severityCounts: null,
            ),
          ),
        ),
      ),
    );

    expect(find.text('Route incident information is temporarily unavailable.'), findsOneWidget);
    expect(find.text('Incident comparison could not be completed.'), findsOneWidget);
    expect(find.textContaining('nearby verified incidents'), findsNothing);
  });
}
