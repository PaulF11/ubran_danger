// File note: This file handles urban_danger_brand_mark.dart.
import 'package:flutter/material.dart';

class UrbanDangerBrandMark extends StatelessWidget {
  const UrbanDangerBrandMark({super.key, required this.color, this.size = 32});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => CustomPaint(
    size: Size.square(size),
    painter: _UrbanDangerBrandPainter(color),
  );
}

class _UrbanDangerBrandPainter extends CustomPainter {
  const _UrbanDangerBrandPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 52;
    canvas
      ..save()
      ..scale(scale);

    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final fill = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    final marker = Path()
      ..moveTo(26, 3.75)
      ..cubicTo(15.92, 3.75, 7.75, 11.92, 7.75, 22)
      ..cubicTo(7.75, 34.62, 26, 48.25, 26, 48.25)
      ..cubicTo(26, 48.25, 44.25, 34.62, 44.25, 22)
      ..cubicTo(44.25, 11.92, 36.08, 3.75, 26, 3.75)
      ..close();
    final route = Path()
      ..moveTo(19, 17.5)
      ..lineTo(19, 23.25)
      ..lineTo(26, 29.5)
      ..lineTo(33, 21.5)
      ..lineTo(33, 18.5);

    canvas
      ..drawPath(marker, stroke)
      ..drawPath(route, stroke)
      ..drawCircle(const Offset(19, 16.5), 2.5, fill)
      ..drawCircle(const Offset(33, 16.5), 2.5, fill)
      ..restore();
  }

  @override
  bool shouldRepaint(_UrbanDangerBrandPainter oldDelegate) =>
      oldDelegate.color != color;
}
