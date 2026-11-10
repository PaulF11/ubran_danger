// File note: This file handles incident_details_screen.dart.

import 'package:flutter/material.dart';

import '../../models/incident.dart';

class IncidentDetailsScreen extends StatelessWidget {
  const IncidentDetailsScreen({super.key, required this.incident});

  final Incident incident;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final severityColor = _severityColor(incident.severity, theme.colorScheme);

    return Scaffold(
      appBar: AppBar(title: const Text('Incident details')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Icons.verified_user_outlined,
                              size: 17,
                              color: theme.colorScheme.primary,
                            ),
                            const SizedBox(width: 7),
                            Text(
                              'VERIFIED INCIDENT RECORD',
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: theme.colorScheme.primary,
                                letterSpacing: 1,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(
                          incident.categoryName,
                          style: theme.textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (incident.categoryDescription.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text(
                            incident.categoryDescription,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            _DetailBadge(
                              label: incident.severity,
                              icon: Icons.priority_high,
                              color: severityColor,
                            ),
                            _DetailBadge(
                              label: incident.verificationStatus,
                              icon: Icons.verified_outlined,
                              color: theme.colorScheme.primary,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(18, 18, 18, 2),
                    child: Column(
                      children: [
                        _DetailRow(
                          icon: Icons.location_on_outlined,
                          label: 'City',
                          value: incident.city,
                        ),
                        if (incident.barangay != null)
                          _DetailRow(
                            icon: Icons.location_city_outlined,
                            label: 'Barangay',
                            value: incident.barangay!,
                          ),
                        if (incident.locationDescription != null)
                          _DetailRow(
                            icon: Icons.place_outlined,
                            label: 'Source-reported location',
                            value: incident.locationDescription!,
                          ),
                        if (incident.latitude != null &&
                            incident.longitude != null)
                          _DetailRow(
                            icon: Icons.pin_drop_outlined,
                            label: 'Mapped reference coordinates',
                            value:
                                '${incident.latitude!.toStringAsFixed(6)}, '
                                '${incident.longitude!.toStringAsFixed(6)}',
                          )
                        else
                          const _DetailRow(
                            icon: Icons.location_off_outlined,
                            label: 'Map location',
                            value:
                                'No reliable coordinates; no marker is shown.',
                          ),
                        if (incident.locationSourceName != null &&
                            incident.locationSourceUrl != null)
                          _DetailRow(
                            icon: Icons.map_outlined,
                            label: 'Coordinate source',
                            value:
                                '${incident.locationSourceName}\n${incident.locationSourceUrl}',
                          ),
                        _DetailRow(
                          icon: Icons.schedule,
                          label: incident.incidentTimeKnown
                              ? 'Incident date and time'
                              : 'Incident date',
                          value: _formatIncidentDate(context, incident),
                        ),
                        _DetailRow(
                          icon: Icons.source_outlined,
                          label: 'Source',
                          value: incident.sourceName,
                        ),
                        if (incident.sourceUrl != null)
                          _DetailRow(
                            icon: Icons.link,
                            label: 'Original source URL',
                            value: incident.sourceUrl!,
                          ),
                        if (incident.sourcePublishedAt != null)
                          _DetailRow(
                            icon: Icons.publish_outlined,
                            label: 'Source publication date',
                            value: incident.sourcePublishedAt!,
                          ),
                        _DetailRow(
                          icon: Icons.rule_outlined,
                          label: 'System-assigned severity',
                          value:
                              '${incident.severity}. Assigned from documented event characteristics; not an official classification.',
                        ),
                        if (incident.verificationMethod != null)
                          _DetailRow(
                            icon: Icons.fact_check_outlined,
                            label: 'Verification method',
                            value: incident.verificationMethod!,
                          ),
                        if (incident.lastVerifiedAt != null)
                          _DetailRow(
                            icon: Icons.verified_user_outlined,
                            label: 'Record verified on',
                            value: MaterialLocalizations.of(context)
                                .formatMediumDate(
                                  incident.lastVerifiedAt!.toLocal(),
                                ),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Description',
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 9),
                        Text(
                          incident.description,
                          style: theme.textTheme.bodyLarge?.copyWith(
                            height: 1.55,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Text(
                    'Incident activity is based on verified incidents collected by Urban Danger; it is not an official crime rate or safety rating.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 21, color: theme.colorScheme.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 3),
                SelectableText(value, style: theme.textTheme.bodyLarge),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailBadge extends StatelessWidget {
  const _DetailBadge({
    required this.label,
    required this.icon,
    required this.color,
  });

  final String label;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.zero,
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

Color _severityColor(String severity, ColorScheme colorScheme) {
  switch (severity.toUpperCase()) {
    case 'LOW':
      return Colors.green.shade700;
    case 'MEDIUM':
      return Colors.orange.shade800;
    case 'HIGH':
      return colorScheme.error;
    default:
      return colorScheme.primary;
  }
}

String _formatIncidentDate(BuildContext context, Incident incident) {
  final localDate = incident.incidentDate.toLocal();
  final dateLabel = MaterialLocalizations.of(
    context,
  ).formatMediumDate(localDate);
  if (!incident.incidentTimeKnown) return dateLabel;
  final timeLabel = MaterialLocalizations.of(
    context,
  ).formatTimeOfDay(TimeOfDay.fromDateTime(localDate));
  return '$dateLabel at $timeLabel';
}
