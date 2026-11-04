import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:urban_danger/services/incident_service.dart';

void main() {
  test('incident service requests the selected feed view', () async {
    final requests = <Uri>[];
    final service = IncidentService(
      client: MockClient((request) async {
        requests.add(request.url);
        return http.Response(jsonEncode({'success': true, 'data': []}), 200);
      }),
      baseUri: Uri.parse('https://production.example'),
    );
    addTearDown(service.close);

    await service.fetchIncidents();
    await service.fetchIncidents(view: IncidentFeedView.historical);
    await service.fetchIncidents(view: IncidentFeedView.all);

    expect(
      requests.map((uri) => uri.queryParameters['view']),
      ['recent', 'historical', 'all'],
    );
  });
}
