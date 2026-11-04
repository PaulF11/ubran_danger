import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:urban_danger/main.dart';

void main() {
  testWidgets('wide screens use the desktop navigation rail', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1024, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const UrbanDangerApp());

    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
  });

  testWidgets('Urban Danger app shows the home screen and navigation labels', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const UrbanDangerApp());

    expect(find.text('URBAN DANGER'), findsOneWidget);
    expect(find.text('Home'), findsWidgets);

    await tester.tap(find.text('Incidents'));
    await tester.pumpAndSettle();
    expect(find.text('Incidents'), findsWidgets);

    await tester.tap(find.text('Map'));
    await tester.pump();
    expect(find.text('Route analysis'), findsOneWidget);

    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('Incidents'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Verified incidents'), findsOneWidget);

    await tester.tap(find.text('Profile'));
    await tester.pumpAndSettle();
    expect(find.text('Profile'), findsWidgets);
  });
}
