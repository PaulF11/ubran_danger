// File note: This file handles analytics_service_test.dart.
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:urban_danger/core/api_config.dart';
import 'package:urban_danger/services/analytics_service.dart';

void main() {
  test('defaults to the production API host', () {
    expect(ApiConfig.baseUri.toString(), 'https://urbandangerintel.netlify.app');
  });

  test('loads the production analytics response', () async {
    late Uri requestedUri;
    final client = MockClient((request) async {
      requestedUri = request.url;
      return http.Response(
        jsonEncode({
          'success': true,
          'data': {
            'total': 3,
            'byCategory': [
              {'label': 'Assault', 'count': 2},
            ],
            'bySeverity': [],
            'byBarangay': [],
            'byMonth': [],
            'activityLevel': 'HIGH',
            'activityByBarangay': [
              {'label': 'Tuktukan', 'count': 2, 'level': 'MODERATE'},
            ],
          },
        }),
        200,
      );
    });
    final service = AnalyticsService(client: client);

    final summary = await service.fetchSummary();

    expect(
      requestedUri,
      Uri.parse(
        'https://urbandangerintel.netlify.app/api/analytics/summary',
      ),
    );
    expect(summary.total, 3);
    expect(summary.byCategory.single.label, 'Assault');
    expect(summary.activityByBarangay.single.level, 'MODERATE');

    client.close();
  });
}
