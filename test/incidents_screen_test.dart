// File note: This file handles incidents_screen_test.dart.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:urban_danger/models/incident.dart';
import 'package:urban_danger/screens/incidents/incidents_screen.dart';
import 'package:urban_danger/services/incident_service.dart';

final productionIncidentRecords = <Map<String, dynamic>>[
  {
    'id': 6,
    'category_name': 'Assault',
    'category_description': 'Physical attack or threatening violence.',
    'city': 'Taguig City',
    'barangay': 'Santa Ana',
    'latitude': null,
    'longitude': null,
    'location_description':
        'Street in Barangay Santa Ana; street name not reported',
    'location_source_name': null,
    'location_source_url': null,
    'description':
        'Two people, including a 13-year-old, were shot in Barangay Santa Ana on September 24, 2025. The article reports that both victims were seriously injured.',
    'severity': 'HIGH',
    'incident_date': '2025-09-24',
    'incident_time_known': 0,
    'source': 'Manila Standard',
    'source_name': 'Manila Standard',
    'source_url':
        'https://manilastandard.net/news/crime-courts/314648598/taguig-police-arrest-two-shooting-suspects.html',
    'source_published_at': '2025-09-28',
    'verification_status': 'VERIFIED',
    'verification_method':
        'Manual source review plus trusted-host, URL, Taguig, date, location, category, severity, and database duplicate checks.',
    'last_verified_at': '2026-10-01T16:42:17Z',
  },
  {
    'id': 4,
    'category_name': 'Assault',
    'category_description': 'Physical attack or threatening violence.',
    'city': 'Taguig City',
    'barangay': 'Tuktukan',
    'latitude': '14.52888540',
    'longitude': '121.07079090',
    'location_description': 'In front of Tuktukan Barangay Hall',
    'location_source_name': 'OpenStreetMap Nominatim',
    'location_source_url': 'https://www.openstreetmap.org/way/286220264',
    'description':
        'A shooting occurred in front of the Tuktukan Barangay Hall. Police said two suspects were killed when an armed civilian fired back as they attempted to shoot a minor.',
    'severity': 'HIGH',
    'incident_date': '2025-06-24T16:45:00+08:00',
    'incident_time_known': 1,
    'source': 'Manila Standard',
    'source_name': 'Manila Standard',
    'source_url':
        'https://manilastandard.net/lgu/314607491/3-dead-in-one-night-of-shooting-incidents-in-taguig-city.html',
    'source_published_at': '2025-06-25',
    'verification_status': 'VERIFIED',
    'verification_method':
        'Manual source review plus trusted-host, URL, Taguig, date, location, category, severity, and database duplicate checks.',
    'last_verified_at': '2026-10-01T16:42:16Z',
  },
  {
    'id': 5,
    'category_name': 'Assault',
    'category_description': 'Physical attack or threatening violence.',
    'city': 'Taguig City',
    'barangay': 'Tuktukan',
    'latitude': null,
    'longitude': null,
    'location_description': 'Bagong Calzada Street, Barangay Tuktukan',
    'location_source_name': null,
    'location_source_url': null,
    'description':
        'Hours after another shooting that evening, a separate shooting occurred on Bagong Calzada Street in Tuktukan; the article reports that a minor victim was shot dead and a suspect was later arrested.',
    'severity': 'HIGH',
    'incident_date': '2025-06-24',
    'incident_time_known': 0,
    'source': 'Manila Standard',
    'source_name': 'Manila Standard',
    'source_url':
        'https://manilastandard.net/lgu/314607491/3-dead-in-one-night-of-shooting-incidents-in-taguig-city.html',
    'source_published_at': '2025-06-25',
    'verification_status': 'VERIFIED',
    'verification_method':
        'Manual source review plus trusted-host, URL, Taguig, date, location, category, severity, and database duplicate checks.',
    'last_verified_at': '2026-10-01T16:42:17Z',
  },
];

void main() {
  testWidgets('incident search and filters fit supported viewport widths', (
    WidgetTester tester,
  ) async {
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    for (final width in [320.0, 360.0, 390.0, 430.0, 768.0, 1024.0, 1440.0]) {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      final service = IncidentService(
        client: MockClient(
          (_) async => http.Response(
            jsonEncode({'success': true, 'data': productionIncidentRecords}),
            200,
          ),
        ),
        baseUri: Uri.parse('https://production.example'),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: IncidentsScreen(incidentService: service)),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull, reason: 'Viewport width $width');
      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('Category'), findsOneWidget);
      expect(find.text('Severity'), findsOneWidget);

      await tester.pumpWidget(const SizedBox.shrink());
      service.close();
    }
  });

  testWidgets('production incidents render as searchable cards and details', (
    WidgetTester tester,
  ) async {
    final service = IncidentService(
      client: MockClient((request) async {
        expect(request.url.path, '/api/incidents');
        return http.Response(
          jsonEncode({'success': true, 'data': productionIncidentRecords}),
          200,
        );
      }),
      baseUri: Uri.parse('https://production.example'),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: IncidentsScreen(incidentService: service)),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('3 incidents'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'Bagong Calzada Street');
    await tester.pumpAndSettle();

    expect(find.text('1 incident'), findsOneWidget);
    expect(
      find.text('Bagong Calzada Street, Barangay Tuktukan'),
      findsOneWidget,
    );
    expect(find.text('Manila Standard'), findsOneWidget);
    expect(find.textContaining('a minor victim was shot dead'), findsOneWidget);

    await tester.tap(find.text('Bagong Calzada Street, Barangay Tuktukan'));
    await tester.pumpAndSettle();

    expect(find.text('Incident details'), findsOneWidget);
    expect(
      find.text('No reliable coordinates; no marker is shown.'),
      findsOneWidget,
    );
    expect(find.textContaining('a minor victim was shot dead'), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'no matching incident');
    await tester.pumpAndSettle();
    expect(find.text('No incidents found.'), findsOneWidget);
  });

  test('production API coordinate strings and nulls parse correctly', () {
    final incidents = productionIncidentRecords.map(Incident.fromJson).toList();

    expect(incidents, hasLength(3));
    expect(incidents[0].latitude, isNull);
    expect(incidents[0].longitude, isNull);
    expect(incidents[1].latitude, 14.5288854);
    expect(incidents[1].longitude, 121.0707909);
    expect(incidents[2].latitude, isNull);
    expect(incidents[2].longitude, isNull);
  });
}
