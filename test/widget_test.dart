import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:urban_danger/main.dart';

void main() {
  testWidgets('Urban Danger app shows the home screen and navigation labels', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const UrbanDangerApp());

    expect(find.text('Urban Danger'), findsOneWidget);
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
