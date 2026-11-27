// File note: This file handles map_route_modes_test.dart.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:urban_danger/screens/map/map_screen.dart';
import 'package:urban_danger/services/incident_service.dart';
import 'package:urban_danger/services/route_service.dart';

Future<void> pumpRouteFrames(WidgetTester tester) async {
  for (var frame = 0; frame < 4; frame++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  testWidgets('route mode cards and action fit every required viewport', (
    tester,
  ) async {
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    for (final width in [320.0, 360.0, 390.0, 430.0, 768.0, 1024.0, 1440.0]) {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      final incidents = IncidentService(
        client: MockClient(
          (_) async =>
              http.Response(jsonEncode({'success': true, 'data': []}), 200),
        ),
        baseUri: Uri.parse('https://example.test'),
      );
      final routes = RouteService(
        client: MockClient(
          (_) async => http.Response(
            jsonEncode({'success': false, 'message': 'Test route failure'}),
            502,
          ),
        ),
        baseUri: Uri.parse('https://example.test'),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: MapScreen(incidentService: incidents, routeService: routes),
          ),
        ),
      );
      await pumpRouteFrames(tester);
      await tester.tap(find.text('Route analysis').first);
      await pumpRouteFrames(tester);
      if (width < 500) {
        await tester.tap(find.text('Plan a safer route'));
        await pumpRouteFrames(tester);
      }

      final modeBounds = [
        for (final mode in ['Car', 'Motorcycle', 'Walk', 'Bicycle', 'Truck'])
          tester.getRect(find.text(mode)),
      ];
      for (var index = 0; index < modeBounds.length; index++) {
        expect(modeBounds[index].left, greaterThanOrEqualTo(0));
        expect(modeBounds[index].right, lessThanOrEqualTo(width));
        for (var other = index + 1; other < modeBounds.length; other++) {
          expect(
            modeBounds[index].overlaps(modeBounds[other]),
            isFalse,
            reason: '$width px: travel mode cards overlap',
          );
        }
      }

      final action = tester.getRect(find.text('Analyze route'));
      expect(action.left, greaterThanOrEqualTo(0), reason: '$width px');
      expect(action.right, lessThanOrEqualTo(width), reason: '$width px');
      expect(action.bottom, lessThanOrEqualTo(900), reason: '$width px');
      expect(tester.takeException(), isNull, reason: '$width px');

      await tester.pumpWidget(const SizedBox.shrink());
      incidents.close();
      routes.close();
    }
  });

  testWidgets('manual route changes wait for Analyze route', (tester) async {
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;

    final requestedModes = <String>[];
    final incidents = IncidentService(
      client: MockClient(
        (_) async =>
            http.Response(jsonEncode({'success': true, 'data': []}), 200),
      ),
      baseUri: Uri.parse('https://example.test'),
    );
    final routes = RouteService(
      client: MockClient((request) async {
        requestedModes.add(
          (jsonDecode(request.body) as Map<String, dynamic>)['mode'] as String,
        );
        return http.Response(
          jsonEncode({'success': false, 'message': 'Test route failure'}),
          502,
        );
      }),
      baseUri: Uri.parse('https://example.test'),
    );
    addTearDown(incidents.close);
    addTearDown(routes.close);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MapScreen(incidentService: incidents, routeService: routes),
        ),
      ),
    );
    await pumpRouteFrames(tester);
    await tester.tap(find.text('Route analysis').first);
    await pumpRouteFrames(tester);
    await tester.tap(find.text('Plan a safer route'));
    await pumpRouteFrames(tester);

    for (final tooltip in [
      'Enter start coordinates',
      'Enter destination coordinates',
    ]) {
      await tester.ensureVisible(find.byTooltip(tooltip));
      await tester.tap(find.byTooltip(tooltip));
      await pumpRouteFrames(tester);
      await tester.enterText(
        find.byType(TextFormField).last,
        '14.51760, 121.05090',
      );
      await tester.tap(find.text('Use location').last);
      await pumpRouteFrames(tester);
    }
    expect(requestedModes, isEmpty);

    await tester.tap(find.text('Analyze route').last);
    await pumpRouteFrames(tester);
    expect(requestedModes, ['car']);

    await tester.ensureVisible(find.text('Motorcycle'));
    await tester.tap(find.text('Motorcycle'));
    await pumpRouteFrames(tester);

    expect(requestedModes, ['car']);
    await tester.ensureVisible(find.text('Analyze route').last);
    await tester.tap(find.text('Analyze route').last);
    await pumpRouteFrames(tester);
    expect(requestedModes, ['car', 'motorcycle']);
    expect(tester.takeException(), isNull);
  });

  testWidgets('map taps wait for Analyze route before requesting a route', (
    tester,
  ) async {
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;

    final requestedModes = <String>[];
    final incidents = IncidentService(
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({
            'success': true,
            'data': [
              {
                'id': 1,
                'category_name': 'Test incident',
                'category_description': 'Test fixture.',
                'city': 'Taguig City',
                'barangay': null,
                'latitude': null,
                'longitude': null,
                'location_description': null,
                'location_source_name': null,
                'location_source_url': null,
                'description': 'Test fixture.',
                'severity': 'LOW',
                'incident_date': '2026-01-01',
                'incident_time_known': false,
                'source': 'Test fixture',
                'source_name': 'Test fixture',
                'source_url': null,
                'source_published_at': null,
                'verification_status': 'VERIFIED',
                'verification_method': null,
                'last_verified_at': null,
              },
            ],
          }),
          200,
        ),
      ),
      baseUri: Uri.parse('https://example.test'),
    );
    final routes = RouteService(
      client: MockClient((request) async {
        requestedModes.add(
          (jsonDecode(request.body) as Map<String, dynamic>)['mode'] as String,
        );
        return http.Response(
          jsonEncode({'success': false, 'message': 'Test route failure'}),
          502,
        );
      }),
      baseUri: Uri.parse('https://example.test'),
    );
    addTearDown(incidents.close);
    addTearDown(routes.close);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MapScreen(incidentService: incidents, routeService: routes),
        ),
      ),
    );
    await pumpRouteFrames(tester);
    await tester.tap(find.text('Route analysis').first);
    await pumpRouteFrames(tester);
    await tester.tap(find.text('Plan a safer route'));
    await pumpRouteFrames(tester);

    await tester.tapAt(const Offset(150, 380));
    await pumpRouteFrames(tester);
    expect(requestedModes, isEmpty);
    expect(find.text('Tap map or enter coordinates'), findsOneWidget);

    await tester.tapAt(const Offset(240, 380));
    await pumpRouteFrames(tester);
    expect(requestedModes, isEmpty);
    expect(find.text('Tap map or enter coordinates'), findsNothing);
    expect(find.text('Out of Scope'), findsNothing);

    await tester.ensureVisible(find.text('Analyze route').last);
    await tester.tap(find.text('Analyze route').last);
    await pumpRouteFrames(tester);
    expect(requestedModes, ['car']);
    expect(tester.takeException(), isNull);
  });
}
