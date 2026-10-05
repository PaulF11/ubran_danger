import 'package:flutter/material.dart';

import '../../models/route_plan.dart';

class RouteSafetySummary extends StatelessWidget {
  const RouteSafetySummary({super.key, required this.intelligence});

  final RouteIntelligence intelligence;

  @override
  Widget build(BuildContext context) {
    final severityCounts = intelligence.severityCounts;
    final threshold = intelligence.proximityThresholdMeters;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Verified incident information', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 6),
        Text(intelligence.message),
        if (intelligence.nearbyVerifiedIncidentCount case final count?)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              '$count nearby verified incident${count == 1 ? '' : 's'} '
              '${threshold == null ? '' : 'within ${threshold.round()} m'}'
              '.',
            ),
          ),
        if (severityCounts != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              'HIGH ${severityCounts['HIGH']}  ·  '
              'MEDIUM ${severityCounts['MEDIUM']}  ·  '
              'LOW ${severityCounts['LOW']}',
            ),
          ),
        if (intelligence.category == 'UNAVAILABLE')
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('Incident comparison could not be completed.'),
          ),
        if (intelligence.category == 'NO_GEOCODED_VERIFIED_INCIDENTS')
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text(
              'Verified incidents without usable coordinates cannot be compared with the route.',
            ),
          ),
        if (intelligence.incidents.isNotEmpty) ...[
          const SizedBox(height: 8),
          ...intelligence.incidents.take(8).map(
                (incident) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    Icons.warning_amber_rounded,
                    color: _severityColor(context, incident.severity),
                  ),
                  title: Text(incident.category),
                  subtitle: Text(
                    '${incident.locationDescription ?? incident.barangay ?? 'Taguig City'}'
                    '  ·  ${incident.severity}'
                    '${_incidentDateLabel(incident.incidentDate)}'
                    '  ·  ${incident.distanceMeters.round()} m from route',
                  ),
                ),
              ),
        ],
        const SizedBox(height: 8),
        Text(
          'Based only on currently verified incidents in the system. '
          'The available dataset is limited; this is not a prediction or a safety guarantee.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
      ],
    );
  }
}

String _incidentDateLabel(String? value) {
  if (value == null) return '';
  return '  ·  ${value.length < 10 ? value : value.substring(0, 10)}';
}

Color _severityColor(BuildContext context, String severity) =>
    switch (severity.toUpperCase()) {
      'LOW' => Colors.green.shade700,
      'MEDIUM' => Colors.orange.shade800,
      'HIGH' => Theme.of(context).colorScheme.error,
      _ => Theme.of(context).colorScheme.primary,
    };
