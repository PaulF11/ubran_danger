// File note: This file handles map_camera_test.dart.
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:urban_danger/core/taguig_region.dart';
import 'package:urban_danger/screens/map/map_screen.dart';

void main() {
  testWidgets(
    'Taguig camera initializes inside bounds and constrains panning at phone and desktop sizes',
    (tester) async {
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      for (final viewport in [
        const Size(320, 800),
        const Size(360, 800),
        const Size(390, 844),
        const Size(430, 844),
        const Size(768, 900),
        const Size(1024, 900),
        const Size(1440, 900),
      ]) {
        tester.view.physicalSize = viewport;
        tester.view.devicePixelRatio = 1;

        final controller = MapController();
        final options = taguigMapOptions(onTap: (_, _) {});
        await tester.pumpWidget(
          MaterialApp(
            home: SizedBox.expand(
              child: FlutterMap(
                mapController: controller,
                options: options,
                children: const [SizedBox.expand()],
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        expect(isWithinTaguigMapArea(controller.camera.center), isTrue);
        expect(controller.camera.zoom, inInclusiveRange(12, 19));

        controller.move(const LatLng(0, 0), controller.camera.zoom);
        await tester.pumpAndSettle();
        expect(taguigMapBounds.contains(controller.camera.center), isTrue);

        controller.move(
          controller.camera.center,
          (controller.camera.zoom + 1).clamp(12, 19),
        );
        await tester.pumpAndSettle();
        expect(controller.camera.zoom, inInclusiveRange(12, 19));

        await tester.pumpWidget(const SizedBox.shrink());
      }
    },
  );

  testWidgets('map controls and attribution fit phone widths', (tester) async {
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    for (final width in [320.0, 360.0, 390.0, 430.0]) {
      tester.view.physicalSize = Size(width, 800);
      tester.view.devicePixelRatio = 1;

      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: MapScreen())),
      );
      await tester.pump();
      expect(find.byType(TextField), findsOneWidget, reason: 'Width $width');
      expect(
        find.text('Route analysis'),
        findsOneWidget,
        reason: 'Width $width',
      );
      expect(tester.takeException(), isNull, reason: 'Width $width');
      await tester.pumpWidget(const SizedBox.shrink());
    }
  });
}
