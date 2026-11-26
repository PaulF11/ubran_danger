import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:urban_danger/screens/profile/profile_screen.dart';

void main() {
  testWidgets('public profile has no administrator sign-in entry', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: ProfileScreen())),
    );

    expect(find.text('Coverage area'), findsOneWidget);
    expect(find.text('Administrator access'), findsNothing);
    expect(find.text('Sign in to view the protected dashboard.'), findsNothing);
  });
}
