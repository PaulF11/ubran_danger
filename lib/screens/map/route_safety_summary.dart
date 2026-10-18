import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/route_plan.dart';

class RouteSafetySummary extends StatelessWidget {
  const RouteSafetySummary({super.key, required this.intelligence});

  final RouteIntelligence intelligence;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final severityCounts = intelligence.severityCounts;
    final threshold = intelligence.proximityThresholdMeters;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.radar_rounded,
                      size: 19,
                      color: theme.colorScheme.primary,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'ROUTE INTELLIGENCE',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.primary,
                        letterSpacing: 1,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  'Verified incident information',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(intelligence.message),
                if (intelligence.nearbyVerifiedIncidentCount case final count?)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      '$count nearby verified incident${count == 1 ? '' : 's'} '
                      '${threshold == null ? '' : 'within ${threshold.round()} m'}'
                      '.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                if (severityCounts != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(9),
                        border: Border.all(
                          color: theme.colorScheme.outlineVariant,
                        ),
                      ),
                      child: Text(
                        'HIGH ${severityCounts['HIGH']}  ·  '
                        'MEDIUM ${severityCounts['MEDIUM']}  ·  '
                        'LOW ${severityCounts['LOW']}',
                        style: theme.textTheme.labelMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
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
              ],
            ),
          ),
        ),
        if (intelligence.incidents.isNotEmpty) ...[
          const SizedBox(height: 14),
          Text(
            'Nearby verified reports',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          ...intelligence.incidents
              .take(8)
              .map(
                (incident) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: Column(
                    children: [
                      ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 13,
                          vertical: 3,
                        ),
                        leading: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: _severityColor(
                              context,
                              incident.severity,
                            ).withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(
                            Icons.warning_amber_rounded,
                            color: _severityColor(context, incident.severity),
                            size: 19,
                          ),
                        ),
                        title: Text(incident.category),
                        subtitle: Text(
                          '${incident.locationDescription ?? incident.barangay ?? 'Taguig City'}'
                          '  ·  ${incident.severity}'
                          '${_incidentDateLabel(incident.incidentDate)}'
                          '${incident.estimatedMinutesFromStart == null ? '' : '  ·  ETA ${incident.estimatedMinutesFromStart == 0 ? 'now' : '~${incident.estimatedMinutesFromStart} min'} along route'}'
                          '  ·  ${incident.distanceMeters.round()} m from route',
                        ),
                      ),
                      if (incident.sourceUrl != null)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton.icon(
                            onPressed: () => launchUrl(
                              Uri.parse(incident.sourceUrl!),
                              mode: LaunchMode.externalApplication,
                            ),
                            icon: const Icon(Icons.open_in_new, size: 16),
                            label: const Text('Open trusted source'),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
        ],
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface.withValues(alpha: 0.65),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: theme.colorScheme.outlineVariant),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.info_outline,
                size: 17,
                color: theme.colorScheme.onSurfaceVariant,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  'Based only on currently verified incidents in the system. '
                  'The available dataset is limited; this is not a prediction or a safety guarantee.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    height: 1.45,
                  ),
                ),
              ),
            ],
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
