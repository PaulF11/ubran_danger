import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:urban_danger/core/taguig_region.dart';
import 'package:urban_danger/models/analytics_summary.dart';
import 'package:urban_danger/models/incident.dart';

void main() {
  test('incident model preserves records with no reliable coordinates', () {
    final incident = Incident.fromJson({
      'id': 1,
      'category_name': 'Assault',
      'category_description': 'Physical attack or threatening violence.',
      'city': 'Taguig City',
      'barangay': 'Santa Ana',
      'latitude': null,
      'longitude': null,
      'location_description': 'Street in Barangay Santa Ana; street name not reported',
      'description': 'Two people were shot in a source-verified Taguig incident.',
      'severity': 'HIGH',
      'incident_date': '2025-09-24T00:00:00.000Z',
      'incident_time_known': 0,
      'source': 'Manila Standard',
      'source_name': 'Manila Standard',
      'source_url': 'https://manilastandard.net/article/example',
      'source_published_at': '2025-09-28T00:00:00.000Z',
      'verification_status': 'VERIFIED',
      'verification_method': 'Manual source review.',
      'last_verified_at': '2026-10-02T00:00:00.000Z',
    });

    expect(incident.city, 'Taguig City');
    expect(incident.barangay, 'Santa Ana');
    expect(incident.latitude, isNull);
    expect(incident.longitude, isNull);
    expect(incident.incidentTimeKnown, isFalse);
    expect(incident.incidentDate.year, 2025);
    expect(incident.incidentDate.month, 9);
    expect(incident.incidentDate.day, 24);
    expect(incident.sourceUrl, 'https://manilastandard.net/article/example');
  });

  test('analytics model reads database-derived activity levels', () {
    final summary = AnalyticsSummary.fromJson({
      'total': 3,
      'byCategory': [],
      'bySeverity': [],
      'byBarangay': [],
      'byMonth': [],
      'activityLevel': 'HIGH',
      'activityByBarangay': [
        {'label': 'Tuktukan', 'count': 2, 'level': 'MODERATE'},
      ],
    });

    expect(summary.total, 3);
    expect(summary.activityLevel, 'HIGH');
    expect(summary.activityByBarangay.single.label, 'Tuktukan');
    expect(summary.activityByBarangay.single.level, 'MODERATE');
  });

  test('Taguig map bounds include Taguig and reject points outside the city area', () {
    expect(isWithinTaguigMapArea(taguigMapCenter), isTrue);
    expect(isWithinTaguigMapArea(const LatLng(14.7, 121.05)), isFalse);
  });
}